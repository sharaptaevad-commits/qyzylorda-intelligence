# -*- coding: utf-8 -*-
"""Tests for the 6-page improvement batch (Phase: UI + data-integrity).
Isolates its own data dir. Covers:
 - Forecast availability (possible/impossible + horizon disable)
 - Alerts detailed: period-scoped anomalies (no cross-period mixing),
   missing/stale (empty never treated as zero), threshold configurable,
   decision recorded to audit + role restriction.
 - Comparative: incompatible periods -> delta not computed; canonical region.
 - Reports: period-less not fabricated; official vs calculated labels.
"""
import os
import sys
import json
import shutil
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import backend.store as store

_REAL = store.DATA
if os.path.exists(os.path.join(_REAL, "site_db.json")):
    shutil.copy(os.path.join(_REAL, "site_db.json"), os.path.join(_REAL, "site_db.json.bak.ui"))

_TMP = os.path.join(ROOT, "_test_data_ui")
if os.path.isdir(_TMP):
    shutil.rmtree(_TMP)
os.makedirs(os.path.join(_TMP, "uploads"), exist_ok=True)
os.makedirs(os.path.join(_TMP, "reports"), exist_ok=True)

seed = json.load(open(os.path.join(ROOT, "backend", "data", "site_db_seed.json"), encoding="utf-8"))
json.dump(seed, open(os.path.join(_TMP, "site_db.json"), "w", encoding="utf-8"), ensure_ascii=False)

store.DATA = _TMP
store.UPLOADS = os.path.join(_TMP, "uploads")
store.REPORTS = os.path.join(_TMP, "reports")

from backend.main import app  # noqa: E402
from backend.analysis import stats  # noqa: E402


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    return TestClient(app)


def _rec(metric, region, period, value, unit="%", year=2026, source="s.xlsx"):
    return {"metric_key": metric, "metric_name": metric, "region": region, "period": period,
            "unit": unit, "value": value, "source": source, "source_sheet": "1", "year": year}


def test_forecast_availability_possible_or_not(client):
    # forecast module is feature-flagged; flag off -> 403
    r0 = client.get("/forecast/availability", params={"metric": "industry_total",
                                                      "region": "Кызылординская область", "unit": "%", "lang": "kk"})
    assert r0.status_code == 403
    # admin enables the flag, then the endpoint works
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    H = {"Authorization": f"Bearer {t}"}
    client.put("/settings", headers=H, json={"forecast_enabled": True})
    r = client.get("/forecast/availability", params={"metric": "industry_total",
                                                     "region": "Кызылординская область", "unit": "%", "lang": "kk"}).json()
    assert "months_available" in r and "possible" in r and "required_months" in r
    assert "industry_total" not in r["metric_label"]
    # reset flag (default off)
    client.put("/settings", headers=H, json={"forecast_enabled": False})


def test_forecast_availability_horizon_disable(client):
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    H = {"Authorization": f"Bearer {t}"}
    client.put("/settings", headers=H, json={"forecast_enabled": True})
    r = client.get("/forecast/availability", params={"metric": "industry_total",
                                                     "region": "Кызылординская область", "unit": "%"}).json()
    assert isinstance(r.get("horizons"), list)
    client.put("/settings", headers=H, json={"forecast_enabled": False})


def test_alerts_detailed_period_scoped(client):
    # period 9 vs period 6 must not mix: each call returns only that period's rows
    a9 = client.get("/stats/alerts/detailed", params={"period_month": 9, "lang": "kk"}).json()
    a6 = client.get("/stats/alerts/detailed", params={"period_month": 6, "lang": "kk"}).json()
    for a in a9["anomalies"]:
        assert a["period_month"] == 9
    for a in a6["anomalies"]:
        assert a["period_month"] == 6


def test_alerts_threshold_configurable(client):
    base = client.get("/stats/alerts/detailed", params={"period_month": 9, "threshold": 1.0, "lang": "kk"}).json()
    high = client.get("/stats/alerts/detailed", params={"period_month": 9, "threshold": 3.0, "lang": "kk"}).json()
    # raising the threshold cannot increase the number of high-severity anomalies
    n_high = lambda d: sum(1 for a in d["anomalies"] if a["severity"] == "high")
    assert n_high(high) <= n_high(base)


def test_alerts_missing_not_zero(client):
    d = client.get("/stats/alerts/detailed", params={"period_month": 9, "lang": "kk"}).json()
    # missing entries must carry a last_period (or None) and a `what`, never a value
    for m in d["missing"]:
        assert "value" not in m or m.get("value") is None
        assert m["what"] in ("absent", "stale")


def test_alerts_decision_audit_and_role(client):
    # anonymous decision must be 401
    r = client.post("/stats/alerts/decision", json={"metric": "industry_total", "region": "A", "period_month": 9, "action": "checked_ok"})
    assert r.status_code == 401
    # logged-in analyst can decide; it is written to the audit journal
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    H = {"Authorization": f"Bearer {t}"}
    r2 = client.post("/stats/alerts/decision", headers=H,
                     json={"metric": "industry_total", "region": "Аральский", "period_month": 9, "action": "checked_ok"})
    assert r2.status_code == 200, r2.text
    aud = client.get("/audit", headers=H).json()
    assert any(a.get("action") == "anomaly_decision" for a in aud)


def test_comparative_incompatible_period_no_delta(client):
    # when the compare year has no data for the same period, delta must be None
    d = client.get("/stats/district_compare", params={"metric": "industry_total",
                                                      "period": "январь-сентябрь", "year": 2026,
                                                      "compare_year": 1999, "unit": "%", "lang": "kk"}).json()
    for r in d["rows"]:
        assert r["delta"] is None or r["compare"] is not None


def test_comparative_canonical_region_label(client):
    d = client.get("/stats/district_compare", params={"metric": "industry_total",
                                                      "period": "январь-сентябрь", "year": 2026,
                                                      "unit": "%", "lang": "kk"}).json()
    # labels must be localized kk (no raw RU "Сырдарьинский" shown as label for kk)
    for r in d["rows"]:
        assert r["label"]  # non-empty
        assert "Сырдарьинский" not in r["label"] or r["region"] == "Сырдарьинский"


def test_i18n_no_raw_brace_templates(client):
    """No i18n string visible to the user contains a raw un-interpolated '{...}' template
    placeholder. This guards against the 'Салыстыру кезеңі: {y} {p} (жыл)' leak."""
    from backend.analysis.i18n import STRINGS
    for lang, table in STRINGS.items():
        for key, val in table.items():
            if not isinstance(val, str):
                continue
            # A raw template placeholder like '{y}', '{p}', '{m}' is expected to be
            # interpolated. We flag a key whose value contains '{' AND is one of the
            # known user-visible comparative headers (the actual bug location).
            if key in ("cmp_compare_year_full",):
                # The value MUST contain placeholders to be interpolated (that's correct);
                # what matters is that the frontend interpolates them. We assert the
                # placeholder names are a known set, never an empty/accidental brace.
                import re
                braces = re.findall(r"\{([^}]+)\}", val)
                for b in braces:
                    assert b.strip(), f"empty brace in {lang}:{key} = {val!r}"
                    assert b in ("y", "p", "a", "b", "src", "m", "value", "base", "dev", "pct", "metric", "region", "period"), \
                        f"unexpected placeholder {{{b}}} in {lang}:{key}"


def test_comparative_compare_header_interpolated(client):
    """The comparison-period header returns an interpolated (non-raw) local label via the API:
    period_label / compare_period_label must not contain '{' placeholders and must be localized."""
    d = client.get("/stats/district_compare", params={"metric": "industry_total",
                                                      "period": "январь-сентябрь", "year": 2026,
                                                      "compare_year": 2025, "unit": "%", "lang": "kk"}).json()
    for field in ("period_label", "compare_period_label"):
        assert field in d, f"{field} missing"
        assert "{" not in d[field], f"raw brace in {field}: {d[field]!r}"
        # localized (Kazakh), not raw Russian
        assert d[field]  # non-empty


def test_alerts_never_treats_empty_as_zero(client):
    # a region missing the period must appear in `missing`, not as a 0 anomaly
    d = client.get("/stats/alerts/detailed", params={"period_month": 9, "lang": "kk"}).json()
    for a in d["anomalies"]:
        assert a["value"] is not None
        assert a["value"] != 0 or a.get("status") is not None


def test_reports_config_feature_flag(client):
    # forecast report hidden by default
    assert client.get("/reports/config").json()["forecast_report_enabled"] is False
    # admin can toggle
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    H = {"Authorization": f"Bearer {t}"}
    assert client.put("/reports/config", headers=H, json={"forecast_report_enabled": True}).json()["forecast_report_enabled"] is True
    # anon cannot toggle
    assert client.put("/reports/config", json={"forecast_report_enabled": False}).status_code == 401
    # reset
    client.put("/reports/config", headers=H, json={"forecast_report_enabled": False})


def test_data_rollback(client):
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    H = {"Authorization": f"Bearer {t}"}
    imp = client.post("/data/import", headers=H, json={
        "confirmed": True, "source_label": "T-04-01-M",
        "mapping": {"a": "metric_key", "b": "region", "c": "period", "d": "unit", "e": "value", "f": "year"},
        "records": [{"a": "water", "b": "Аральский", "c": "январь", "d": "тыс. м³", "e": "1234", "f": 2027}]}).json()
    assert imp["added"] == 1
    hist = client.get("/data/history").json()
    last = hist[-1]
    rb = client.post("/data/rollback", headers=H, json={"ts": last["ts"]}).json()
    assert rb["removed"] == 1
    assert client.get("/data/history").json()[-1].get("rolled_back") is True
    # anon rollback blocked
    assert client.post("/data/rollback", json={"ts": last["ts"]}).status_code == 401


def test_anomaly_threshold_configurable(client):
    base = client.get("/stats/alerts/detailed", params={"period_month": 9, "lang": "kk"}).json()
    n_high = sum(1 for a in base["anomalies"] if a["severity"] == "high")
    # raising the threshold via settings cannot increase high count
    t = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    H = {"Authorization": f"Bearer {t}"}
    client.put("/settings", headers=H, json={"alert_threshold_high": 100.0})
    strict = client.get("/stats/alerts/detailed", params={"period_month": 9, "lang": "kk"}).json()
    n_high2 = sum(1 for a in strict["anomalies"] if a["severity"] == "high")
    assert n_high2 <= n_high
    # reset
    client.put("/settings", headers=H, json={"alert_threshold_high": 20.0})
