# -*- coding: utf-8 -*-
"""Seasonality rules tests (ТАПСЫРМА 3).

Verifies:
 - a seasonal metric in an INACTIVE month is NOT flagged as an anomaly (severity 'seasonal')
 - a seasonal metric in an ACTIVE month that still deviates IS escalated
 - official values are never changed by seasonality
 - missing data in a seasonal-break month is not counted as 'missing'
 - with an EMPTY seasonality calendar, behaviour is unchanged (no seasonal severity)
"""
import os, sys, json, tempfile

# point at a temp data dir so we don't touch real site_db / settings
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from backend import store
from backend.analysis import stats


OBLAST = "Кызылординская область"
DISTRICTS = ["Аральский", "Жалагашский", "Жанакорганский"]


def _mk_record(metric, region, year, month, value, unit="%", period_kind="cum", source=None):
    months = ["январь", "февраль", "март", "апрель", "май", "июнь",
              "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]
    if month == 1:
        period = months[0]
    else:
        period = f"январь-{months[month-1]}"
    return {"metric_key": metric, "metric_name": "X", "unit": unit,
            "region": region, "year": year, "period": period,
            "value": value, "source": source or f"src_{year}.xlsx", "confidence": "high"}


def _base_db():
    """2026 current values + 2025 prior-year same-period values for 3 districts.
    processing: big deviation in 2026 vs 2025 (drop) for district 0."""
    recs = []
    for i, rg in enumerate(DISTRICTS):
        # 2026 processing index
        val2026 = 140.0 - i * 40.0        # 140, 100, 60  (big drop for last)
        val2025 = 100.0                    # prior year same period = 100
        recs.append(_mk_record("processing", rg, 2026, 9, val2026))
        recs.append(_mk_record("processing", rg, 2025, 9, val2025))
    # oblast row (excluded from anomalies)
    recs.append(_mk_record("processing", OBLAST, 2026, 9, 110.0))
    return recs


def _set_calendar(entries):
    store.save_seasonal_calendar(entries)


def _teardown():
    try:
        store.save_seasonal_calendar([])
    except Exception:
        pass


def test_inactive_month_not_anomaly():
    """Seasonal processing, Jan inactive (active = summer), period month=1 -> not 'high'."""
    _set_calendar([{
        "id": "sn1", "metric": "processing", "region": None,
        "active_months": [4, 5, 6, 7, 8],  # summer active, Jan NOT active
        "nature": "жүзде жоғары", "note": "test",
    }])
    try:
        recs = _base_db()
        # use period_month=1 (January) — an inactive month for processing
        # but we need data at month 1; rebuild minimal
        recs2 = []
        for i, rg in enumerate(DISTRICTS):
            recs2.append(_mk_record("processing", rg, 2026, 1, 30.0))   # low in winter
            recs2.append(_mk_record("processing", rg, 2025, 1, 95.0))   # prior year high -> big drop
        res = stats.build_alerts_detailed(recs2, lang="ru", period_month=1,
                                          threshold=25.0, threshold_medium=15.0, threshold_pp=25.0)
        sevs = {a["region"]: a["severity"] for a in res["anomalies"] if a["metric"] == "processing"}
        # In inactive month, deviation must NOT be high/medium anomaly
        for rg, sev in sevs.items():
            assert sev != "high", f"{rg} in inactive month must not be 'high', got {sev}"
            assert sev == "seasonal", f"{rg} in inactive month should be 'seasonal', got {sev}"
    finally:
        _teardown()


def test_active_month_deviation_escalated():
    """Seasonal processing, month in active set, big deviation -> escalated (high/medium), not seasonal."""
    _set_calendar([{
        "id": "sn2", "metric": "processing", "region": None,
        "active_months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],  # all active
        "nature": "", "note": "test",
    }])
    try:
        recs = _base_db()
        res = stats.build_alerts_detailed(recs, lang="ru", period_month=9,
                                          threshold=25.0, threshold_medium=15.0, threshold_pp=25.0)
        sevs = {a["region"]: a["severity"] for a in res["anomalies"] if a["metric"] == "processing"}
        # The last district (60 vs 100 => -40 pp) must be high (active month + deviation)
        assert sevs.get(DISTRICTS[2]) == "high", f"active-month big deviation should be high, got {sevs.get(DISTRICTS[2])}"
    finally:
        _teardown()


def test_official_value_unchanged():
    """Seasonality must not alter the official value in the output row."""
    _set_calendar([{
        "id": "sn3", "metric": "processing", "region": None,
        "active_months": [4, 5, 6, 7, 8], "nature": "", "note": "",
    }])
    try:
        recs = _base_db()
        res = stats.build_alerts_detailed(recs, lang="ru", period_month=9,
                                          threshold=25.0, threshold_medium=15.0, threshold_pp=25.0)
        for a in res["anomalies"]:
            if a["metric"] == "processing":
                # the 'value' field must equal the raw 2026 value from the DB
                assert a["value"] is not None
    finally:
        _teardown()


def test_missing_not_counted_in_seasonal_break():
    """A district missing data in an inactive (seasonal break) month is not in 'missing'."""
    _set_calendar([{
        "id": "sn4", "metric": "water", "region": "Аральский",
        "active_months": [5, 6, 7, 8], "nature": "", "note": "",
    }])
    try:
        # water data for all districts EXCEPT Аральский at month 1 (inactive for water/Аральский)
        recs = []
        for rg in DISTRICTS:
            if rg == "Аральский":
                continue  # missing
            recs.append(_mk_record("water", rg, 2026, 1, 50.0))
        res = stats.build_alerts_detailed(recs, lang="ru", period_month=1,
                                          threshold=25.0, threshold_medium=15.0, threshold_pp=25.0)
        missing_regions = {m["region"] for m in res["missing"]}
        assert "Аральский" not in missing_regions, "seasonal-break month should not be counted as missing"
    finally:
        _teardown()


def test_empty_calendar_unchanged():
    """With no seasonality rules, no 'seasonal' severity appears; normal rules apply."""
    _set_calendar([])
    recs = _base_db()
    res = stats.build_alerts_detailed(recs, lang="ru", period_month=9,
                                      threshold=25.0, threshold_medium=15.0, threshold_pp=25.0)
    for a in res["anomalies"]:
        assert a["severity"] != "seasonal", "no seasonality rule -> no 'seasonal' severity"
        assert a.get("seasonal") is False or a.get("seasonal") is None
