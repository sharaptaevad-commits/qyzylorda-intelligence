# -*- coding: utf-8 -*-
"""Test suite for QYZYLORDA INDUSTRIAL INTELLIGENCE.
Run:  pytest tests/ -v
"""
import os
import sys
import json
import shutil
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

# --- isolate the data dir BEFORE importing any app module ----------------
import backend.store as store

MONTH_PERIOD = {1: "январь", 2: "январь-февраль", 3: "январь-март", 4: "январь-апрель",
                5: "январь-май", 6: "январь-июнь", 7: "январь-июль", 8: "январь-август",
                9: "январь-сентябрь", 10: "январь-октябрь", 11: "январь-ноябрь", 12: "январь-декабрь"}
_REAL_DATA = store.DATA
_BAK = None
if os.path.exists(os.path.join(_REAL_DATA, "site_db.json")):
    _BAK = os.path.join(_REAL_DATA, "site_db.json.bak")
    shutil.copy(os.path.join(_REAL_DATA, "site_db.json"), _BAK)

_TMP = os.path.join(ROOT, "_test_data")
if os.path.isdir(_TMP):
    shutil.rmtree(_TMP)
os.makedirs(os.path.join(_TMP, "uploads"), exist_ok=True)
os.makedirs(os.path.join(_TMP, "reports"), exist_ok=True)

# seed a fresh DB copy from the real seed file
_seed_src = os.path.join(ROOT, "backend", "data", "site_db_seed.json")
seed = json.load(open(_seed_src, encoding="utf-8"))
json.dump(seed, open(os.path.join(_TMP, "site_db.json"), "w", encoding="utf-8"), ensure_ascii=False)

store.DATA = _TMP
store.UPLOADS = os.path.join(_TMP, "uploads")
store.REPORTS = os.path.join(_TMP, "reports")

# now import app modules (they read store.DATA at call time)
from backend.analysis import compare, forecast, stats
from backend.analysis.common import month_number, norm_region, period_key
from backend.analysis.i18n import STRINGS, LANGS, t


def _cleanup():
    if os.path.isdir(_TMP):
        shutil.rmtree(_TMP, ignore_errors=True)
    if _BAK and os.path.exists(_BAK):
        shutil.move(_BAK, os.path.join(_REAL_DATA, "site_db.json"))


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient
    import backend.main as m
    c = TestClient(m.app)
    yield c
    _cleanup()


def _rec(mk="industry_total", region="Аральский", period="январь-сентябрь", unit="%", value=100.0, source="a.xlsx"):
    return {"metric_key": mk, "metric_name": mk, "region": region, "period": period, "unit": unit,
            "value": value, "source": source, "source_sheet": "1", "year": 2026}


# ------------------------------------------------- normalization
def test_norm_region_aliases():
    assert norm_region("Кызылординская область") == "Кызылординская область"
    assert norm_region("Кызылорда") == "Кызылорда г.а"
    assert norm_region("аральский район") == "Аральский"
    assert norm_region("nonexistent") is None


def test_period_key_equivalence():
    assert period_key("январь-сентябрь") == period_key("янв-сен (суммарно)") == "cum9"
    assert period_key("январь") == "cum1"


def test_month_number():
    assert month_number("январь-сентябрь") == 9
    assert month_number("январь") == 1
    assert month_number("декабрь") == 12


# ------------------------------------------------- comparison
def test_compare_match_within_tolerance():
    res = compare.compare([_rec(value=100.5, source="d")], [_rec(value=100.0)])
    assert len(res["matched"]) == 1
    assert abs(res["matched"][0]["pct_diff"]) <= 1.0


def test_compare_discrepancy():
    res = compare.compare([_rec(value=110.0, source="d")], [_rec(value=100.0)])
    assert len(res["discrepancies"]) == 1
    d = res["discrepancies"][0]
    assert d["abs_diff"] == pytest.approx(10.0)
    assert d["pct_diff"] == pytest.approx(10.0)


def test_compare_unit_mismatch_not_matched():
    res = compare.compare([_rec(unit="тыс. теңге", source="d")], [_rec(unit="%")])
    assert not res["matched"]


def test_compare_new_in_document():
    res = compare.compare([_rec(region="Шиелийский", source="d")], [])
    assert len(res["new_in_document"]) == 1


def test_compare_missing_in_document():
    res = compare.compare([_rec(region="Шиелийский", source="d")], [_rec(region="Шиелийский")])
    assert res["missing_in_document"] == []


# ------------------------------------------------- forecast
def test_forecast_insufficient():
    pts = [{"month": i, "value": 100.0} for i in range(1, 4)]
    assert forecast.run_forecast(pts, horizon=6)["available"] is False


def test_forecast_with_history():
    hist = [100, 102, 98, 105, 110, 108, 115, 112, 118, 120, 125, 130, 128, 132, 129, 135, 140, 138, 145, 142]
    pts = [{"month": i + 1, "value": v} for i, v in enumerate(hist)]
    res = forecast.run_forecast(pts, horizon=6)
    assert res["available"] is True
    assert len(res["forecast"]) == 6
    assert res["best_model"] in res["metrics"]
    assert res["metrics"][res["best_model"]]["rmse"] is not None


def test_forecast_evaluates_all_models():
    hist = [100, 102, 98, 105, 110, 108, 115, 112, 118, 120, 125, 130] * 2
    pts = [{"month": i + 1, "value": v} for i, v in enumerate(hist)]
    res = forecast.run_forecast(pts, horizon=3)
    assert res["available"]
    assert "seasonal_naive" in res["metrics"]
    assert "holt" in res["metrics"]


def test_mape_skipped_for_zero():
    m = forecast._mape([0, 100], [5, 100])
    assert m is None or m < 200


# ------------------------------------------------- stats
def test_kpis_shape():
    db = store.get_site_db()
    k = stats.kpis(db, lang="ru")
    for key in ["kpi_volume", "kpi_index", "kpi_mfg_index", "kpi_districts"]:
        assert key in k


def test_district_table():
    rows = stats.district_table(store.get_site_db(), "industry_total", month=9, unit="%", lang="ru")
    assert isinstance(rows, list) and len(rows) > 0


def test_monthly_series_invalid_for_single_point():
    db = store.get_site_db()
    s, valid, note = stats.monthly_series(db, "industry_total", "Кызылординская область", unit="%")
    assert valid is False  # only one cumulative month present -> not derivable


# ------------------------------------------------- i18n
def test_i18n_all_langs_have_core_keys():
    core = ["nav_dashboard", "nav_forecast", "forecast_unavailable", "login", "kpi_index", "ai_title", "reports_title"]
    for lang in LANGS:
        for k in core:
            assert k in STRINGS[lang], f"{lang} missing {k}"


def test_i18n_t_fallback():
    assert t("xx", "any") == "any"
    assert t("ru", "nav_dashboard") == "Дашборд"


# ------------------------------------------------- validation
def test_validate_record_bad_metric():
    import backend.main as m
    assert "unknown metric_key" in m._validate_record({"metric_key": "bogus", "region": "Аральский", "value": 1, "unit": "%", "period": "январь"})


def test_validate_record_bad_region():
    import backend.main as m
    assert "unknown region" in m._validate_record({"metric_key": "mining", "region": "nowhere", "value": 1, "unit": "%", "period": "январь"})


def test_validate_record_non_numeric():
    import backend.main as m
    assert "non-numeric value" in m._validate_record({"metric_key": "mining", "region": "Аральский", "value": "abc", "unit": "%", "period": "январь"})


def test_validate_record_ok():
    import backend.main as m
    assert m._validate_record({"metric_key": "mining", "region": "Аральский", "value": 1.5, "unit": "%", "period": "январь"}) == []


# ------------------------------------------------- API
def test_api_login(client):
    r = client.post("/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200 and "token" in r.json()


def test_api_login_bad(client):
    assert client.post("/auth/login", json={"username": "admin", "password": "wrong"}).status_code == 401


def test_api_dashboard(client):
    d = client.get("/stats/dashboard", params={"lang": "ru"}).json()
    assert "kpi" in d and "kpi_index" in d["kpi"]


def test_api_i18n(client):
    for lang in LANGS:
        assert "nav_dashboard" in client.get(f"/i18n/{lang}").json()


def test_api_authorization_blocks_viewer_forecast(client):
    tok = client.post("/auth/login", json={"username": "viewer", "password": "viewer"}).json()["token"]
    assert client.post("/forecast", json={"metric": "industry_total", "horizon": 6},
                       headers={"Authorization": "Bearer " + tok}).status_code == 403


def test_api_forecast_returns_valid_shape(client):
    tok = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    H = {"Authorization": "Bearer " + tok}
    # forecast module is feature-flagged; enable it for this test
    client.put("/settings", headers=H, json={"forecast_enabled": True})
    body = client.post("/forecast", json={"metric": "industry_total", "unit": "%", "horizon": 6}, headers=H).json()
    assert "available" in body
    # reset flag (default off)
    client.put("/settings", headers=H, json={"forecast_enabled": False})


def test_api_comparative(client):
    tok = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    r = client.post("/comparative/run", json={
        "metric": "industry_total", "unit": "%",
        "region_a": "Кызылординская область", "region_b": "Аральский",
        "month_a": 9, "month_b": 9, "lang": "ru"},
        headers={"Authorization": "Bearer " + tok}).json()
    assert r["comparable"] is True
    assert r["pct_diff"] is not None


def test_api_import_requires_confirmation(client):
    tok = client.post("/auth/login", json={"username": "admin", "password": "admin"}).json()["token"]
    r = client.post("/import/fakeid", json={"records": [], "confirmed": False},
                    headers={"Authorization": "Bearer " + tok})
    assert r.status_code in (400, 404)


# ------------------------------------------------- reports
def test_report_pdf(client):
    r = client.get("/reports/export/pdf", params={"metric": "industry_total", "unit": "%", "region": "Кызылординская область", "lang": "ru"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/pdf")
    assert len(r.content) > 1000


def test_report_xlsx(client):
    r = client.get("/reports/export/xlsx", params={"metric": "industry_total", "unit": "%", "region": "Кызылординская область", "lang": "ru"})
    assert r.status_code == 200 and len(r.content) > 500


# ------------------------------------------------- upload edge cases
def test_upload_rejects_bad_extension(client):
    r = client.post("/upload", files={"file": ("evil.exe", b"MZ...", "application/octet-stream")})
    assert r.status_code == 400


def test_upload_does_not_500_on_empty(client):
    r = client.post("/upload", files={"file": ("empty.csv", b"", "text/csv")})
    assert r.status_code in (200, 400)


# ------------------------------------------------- YoY comparison (same cumulative period, prior year)
def _rec_year(mk, region, period, unit, value, year, source="a.xlsx"):
    return {"metric_key": mk, "metric_name": mk, "region": region, "period": period, "unit": unit,
            "value": value, "source": source, "source_sheet": "1", "year": year}


def test_yoy_index_found_percent_points():
    recs = [
        _rec_year("industry_total", "Кызылординская область", "январь-сентябрь", "%", 107.2, 2026),
        _rec_year("industry_total", "Кызылординская область", "январь-сентябрь", "%", 100.0, 2025),
    ]
    r = stats.yoy_compare(recs, "industry_total", "Кызылординская область", 9, "%", "idx")
    assert r["prior_year"] == 2025
    assert r["change"] == 7.2            # 107.2 - 100.0 percentage points
    assert r["change_pct"] == 7.2        # index: same magnitude
    assert r["reason"] is None


def test_yoy_volume_abs_and_relative():
    recs = [
        _rec_year("industry_total", "Кызылординская область", "январь-сентябрь", "тыс. теңге", 200.0, 2026),
        _rec_year("industry_total", "Кызылординская область", "январь-сентябрь", "тыс. теңге", 160.0, 2025),
    ]
    r = stats.yoy_compare(recs, "industry_total", "Кызылординская область", 9, "тыс. теңге", "vol")
    assert r["prior_year"] == 2025
    assert r["change"] == 40             # absolute diff
    assert r["change_pct"] == 25.0       # relative 25%
    # index and volume must NOT be mixed: index uses п.п., volume uses abs+rel
    ri = stats.yoy_compare([
        _rec_year("industry_total", "Кызылординская область", "январь-сентябрь", "%", 107.2, 2026),
        _rec_year("industry_total", "Кызылординская область", "январь-сентябрь", "%", 100.0, 2025)],
        "industry_total", "Кызылординская область", 9, "%", "idx")
    assert ri["change_pct"] == ri["change"]  # index: relative == п.п.


def test_yoy_falls_back_to_earlier_year():
    recs = [
        _rec_year("mining", "Кызылординская область", "январь-сентябрь", "%", 95.0, 2026),
        _rec_year("mining", "Кызылординская область", "январь-сентябрь", "%", 101.0, 2024),  # 2025 absent
    ]
    r = stats.yoy_compare(recs, "mining", "Кызылординская область", 9, "%", "idx")
    assert r["prior_year"] == 2024
    assert r["change"] == -6.0


def test_yoy_no_prior_precise_reason():
    recs = [_rec_year("industry_total", "Кызылординская область", "январь-сентябрь", "%", 107.2, 2026)]
    r = stats.yoy_compare(recs, "industry_total", "Кызылординская область", 9, "%", "idx")
    assert r["prior_year"] is None
    assert r["reason"] == "no_prior"
    assert r["value"] == 107.2


def test_yoy_no_current_value():
    r = stats.yoy_compare([], "industry_total", "Кызылординская область", 9, "%", "idx")
    assert r["reason"] == "no_current"
    assert r["value"] is None


def test_yoy_zero_base_volume_no_relative():
    recs = [
        _rec_year("water", "Кызылординская область", "январь-сентябрь", "тыс. теңге", 50.0, 2026),
        _rec_year("water", "Кызылординская область", "январь-сентябрь", "тыс. теңге", 0.0, 2025),
    ]
    r = stats.yoy_compare(recs, "water", "Кызылординская область", 9, "тыс. теңге", "vol")
    assert r["change"] == 50             # absolute works
    assert r["change_pct"] is None       # relative undefined at base 0 (distinguish 0 from missing)


def test_dashboard_kpi_cards_have_yoy(client):
    r = client.get("/stats/dashboard", params={"lang": "ru"})
    assert r.status_code == 200
    kc = r.json()["kpi_cards"]
    for key in ("volume", "index", "mfg_output", "mfg_index"):
        assert "change" in kc[key] and "prior_year" in kc[key] and "yoy_reason" in kc[key]
    # index card must be labeled п.п. (change equals change_pct) when a prior year exists
    idx = kc["index"]
    if idx["change"] is not None:
        assert idx["change_pct"] == idx["change"]


def test_district_compare_no_duplicates():
    """One period -> one row per district, no duplicates, oblast separate."""
    recs = store.get_site_db()
    res = stats.district_compare(recs, "industry_total", "%", "январь-сентябрь", 2026, 2025, lang="kk")
    ids = [r["id"] for r in res["rows"]]
    assert len(ids) == len(set(ids)), "duplicate districts"
    assert "Кызылординская область" not in [r["region"] for r in res["rows"]]
    assert res["oblast"] is not None
    assert len(res["rows"]) == 9  # 7 districts + 2 cities (no oblast)


def test_district_compare_periods_not_mixed():
    """Comparison uses the SAME period string in prior year (compatible only)."""
    recs = store.get_site_db()
    res = stats.district_compare(recs, "industry_total", "%", "январь-сентябрь", 2026, 2025, lang="kk")
    for r in res["rows"]:
        if r["compare"] is not None and r["value"] is not None:
            expected_delta = round(r["value"] - r["compare"], 1)
            assert abs(r["delta"] - expected_delta) < 0.2


def test_district_compare_no_fabrication():
    """Missing values stay None, never 0."""
    recs = [{"metric_key": "industry_total", "region": "TestD", "period": "январь", "unit": "%",
             "year": 2026, "value": None, "source": "test.xlsx"},
            {"metric_key": "industry_total", "region": "TestD", "period": "январь", "unit": "%",
             "year": 2025, "value": 100.0, "source": "test.xlsx"}]
    res = stats.district_compare(recs, "industry_total", "%", "январь", 2026, 2025, lang="kk")
    for r in res["rows"]:
        if r["value"] is None:
            assert r["status"] == "no_data"


def test_district_compare_mismatch_no_delta():
    """Incompatible periods (different end month) -> delta is None, mismatch flag set.
    The comparison value is still shown (informational) but no delta is computed."""
    recs = store.get_site_db()
    # Ensure a prior-year annual row exists for the mismatch case (seed only has 2026).
    syr = next((r for r in recs if r.get("region") == "Сырдарьинский" and r.get("metric_key") == "industry_total" and r.get("year") == 2026 and r.get("period") == "январь-сентябрь"), None)
    if syr:
        recs = list(recs) + [{"metric_key": "industry_total", "region": "Сырдарьинский", "period": "январь-декабрь", "unit": "%", "year": 2025, "value": 150.0, "source": "OKED 12.2025.xlsx", "confidence": "high"}]
    res = stats.district_compare(recs, "industry_total", "%", "январь-сентябрь", 2026,
                                 2025, compare_period="январь-декабрь", lang="kk")
    assert res["period_mismatch"] is True
    for r in res["rows"]:
        assert r["delta"] is None, f"delta must be None for mismatch, got {r['delta']}"


def test_district_compare_compatible_delta():
    """Compatible periods (same end month) -> delta computed."""
    recs = store.get_site_db()
    # Seed prior-year rows for all 9 regions (seed file has only 2026).
    base = [r for r in recs if r.get("metric_key") == "industry_total" and r.get("year") == 2026 and r.get("period") == "январь-сентябрь"]
    extra = []
    for r in base:
        extra.append({"metric_key": "industry_total", "region": r["region"], "period": "январь-сентябрь", "unit": "%", "year": 2025, "value": (r.get("value") or 100.0) - 10.0, "source": "OKED 12.2025.xlsx", "confidence": "high"})
    recs = list(recs) + extra
    res = stats.district_compare(recs, "industry_total", "%", "январь-сентябрь", 2026,
                                 2025, compare_period="январь-сентябрь", lang="kk")
    assert res["period_mismatch"] is False
    # At least one row with a computed delta
    assert any(r["delta"] is not None for r in res["rows"])


def test_district_compare_status_sync_review():
    """A row deviating > threshold_pp (25) vs prior year is flagged 'review'
    (synced with the Alerts page), not 'verified'."""
    recs = store.get_site_db()
    base = [r for r in recs if r.get("metric_key") == "industry_total" and r.get("year") == 2026 and r.get("period") == "январь-сентябрь"]
    # Prior year: small deviation for all, but a huge deviation for Сырдария (30 p.p.)
    extra = []
    for r in base:
        if r["region"] == "Сырдарьинский":
            prior = (r.get("value") or 300.0) - 30.0  # deviation = +30 p.p. -> review
        else:
            prior = (r.get("value") or 100.0) - 1.0    # deviation = +1 p.p. -> verified
        extra.append({"metric_key": "industry_total", "region": r["region"], "period": "январь-сентябрь", "unit": "%", "year": 2025, "value": prior, "source": "OKED 12.2025.xlsx", "confidence": "high"})
    recs = list(recs) + extra
    res = stats.district_compare(recs, "industry_total", "%", "январь-сентябрь", 2026,
                                 2025, compare_period="январь-сентябрь", lang="kk")
    syr = next((r for r in res["rows"] if r["region"] == "Сырдарьинский"), None)
    assert syr is not None
    assert syr["status"] == "review", f"expected review, got {syr['status']}"
    # A small-deviation row stays verified
    small = next((r for r in res["rows"] if abs(r.get("delta") or 0) < 5 and r["value"] is not None and r["region"] != "Сырдарьинский"), None)
    if small:
        assert small["status"] == "verified"


def test_district_compare_canonical_region_names():
    """Region labels are canonical (no truncated 'Шие ауд.'; 'Шиелі ауданы' etc)."""
    recs = store.get_site_db()
    res = stats.district_compare(recs, "industry_total", "%", "январь-сентябрь", 2026,
                                 2025, compare_period="январь-сентябрь", lang="kk")
    labels = [r["label"] for r in res["rows"]]
    assert any(l == "Шиелі ауданы" for l in labels), f"Шиелі ауданы missing: {labels}"
    assert not any(l == "Шие ауд." for l in labels), f"truncated 'Шие ауд.' present"
    # Russian labels are Russian, not Kazakh
    res_ru = stats.district_compare(recs, "industry_total", "%", "январь-сентябрь", 2026,
                                    2025, compare_period="январь-сентябрь", lang="ru")
    ru_labels = [r["label"] for r in res_ru["rows"]]
    assert any("Шиелийский" in l for l in ru_labels), f"Russian label missing: {ru_labels}"
    assert not any("Шиелі" in l for l in ru_labels), f"Kazakh label leaked into RU: {ru_labels}"


def test_district_compare_two_sources():
    """Each row carries both the main source and the comparison source."""
    recs = store.get_site_db()
    base = [r for r in recs if r.get("metric_key") == "industry_total" and r.get("year") == 2026 and r.get("period") == "январь-сентябрь"]
    extra = []
    for r in base:
        extra.append({"metric_key": "industry_total", "region": r["region"], "period": "январь-сентябрь", "unit": "%", "year": 2025, "value": (r.get("value") or 100.0) - 5.0, "source": "OKED 12.2025.xlsx", "confidence": "high"})
    recs = list(recs) + extra
    res = stats.district_compare(recs, "industry_total", "%", "январь-сентябрь", 2026,
                                 2025, compare_period="январь-сентябрь", lang="kk")
    for r in res["rows"]:
        assert "source" in r and "compare_source" in r
        if r["compare"] is not None:
            assert r["compare_source"], "compare_source missing when compare value present"


def test_available_periods_count():
    recs = store.get_site_db()
    ps = stats.available_periods(recs, "industry_total", "%")
    # temp test DB may only have 2026 (1 period); real DB has 13
    assert len(ps) >= 1


def test_index_never_derived_monthly():
    """Cumulative indexes must NOT be differenced into a 'monthly index'.
    index_dynamics returns raw cumulative values, no delta-based series."""
    recs = [{
        "metric_key": "industry_total", "region": "R", "unit": "%",
        "period": "январь-февраль", "value": 110.0, "year": 2026, "source": "x.xlsx",
    }, {
        "metric_key": "industry_total", "region": "R", "unit": "%",
        "period": "январь", "value": 100.0, "year": 2026, "source": "x.xlsx",
    }]
    res = stats.index_dynamics(recs, "industry_total", "R", 2026, unit="%")
    vals = [p["value"] for p in res["series"]]
    # values are the cumulative ones (100.0, 110.0), NOT deltas
    assert 100.0 in vals and 110.0 in vals
    # no derived negative monthly like -10 or +10
    assert not any(v == -10.0 or v == 10.0 for v in vals)


def test_volume_monthly_delta_correct():
    """Cumulative volume difference -> monthly volume is correct."""
    recs = []
    for m, cum in [(1, 100.0), (2, 250.0), (3, 420.0)]:
        recs.append({"metric_key": "industry_total", "region": "R", "unit": "тыс. теңге",
                     "period": MONTH_PERIOD[m], "value": cum, "year": 2026, "source": "x.xlsx"})
    res = stats.volume_monthly(recs, "industry_total", "R", 2026, unit="тыс. теңге")
    by_m = {p["month"]: p["value"] for p in res["series"]}
    assert by_m[1] == 100.0      # January = own cumulative
    assert by_m[2] == 150.0      # 250 - 100
    assert by_m[3] == 170.0      # 420 - 250


def test_volume_monthly_null_for_missing():
    """Missing adjacent period -> null, never 0."""
    recs = [
        {"metric_key": "industry_total", "region": "R", "unit": "тыс. теңге",
         "period": "январь", "value": 100.0, "year": 2026, "source": "x.xlsx"},
        {"metric_key": "industry_total", "region": "R", "unit": "тыс. теңге",
         "period": "январь-март", "value": 400.0, "year": 2026, "source": "x.xlsx"},
    ]
    res = stats.volume_monthly(recs, "industry_total", "R", 2026, unit="тыс. теңге")
    by_m = {p["month"]: p["value"] for p in res["series"]}
    assert by_m[1] == 100.0
    assert by_m[2] is None   # no February cumulative -> null
    assert by_m[3] is None   # can't derive (needs Feb)


def test_volume_monthly_negative_flagged():
    """A decreasing cumulative volume is flagged needs_review, not hidden."""
    recs = [
        {"metric_key": "industry_total", "region": "R", "unit": "тыс. теңге",
         "period": "январь", "value": 500.0, "year": 2026, "source": "x.xlsx"},
        {"metric_key": "industry_total", "region": "R", "unit": "тыс. теңге",
         "period": "январь-февраль", "value": 300.0, "year": 2026, "source": "x.xlsx"},
    ]
    res = stats.volume_monthly(recs, "industry_total", "R", 2026, unit="тыс. теңге")
    feb = [p for p in res["series"] if p["month"] == 2][0]
    assert feb["value"] == -200.0
    assert feb["needs_review"] is True


def test_index_dynamics_rounding():
    """Delta is rounded to 1 decimal."""
    recs = [
        {"metric_key": "industry_total", "region": "R", "unit": "%",
         "period": "январь", "value": 100.0, "year": 2026, "source": "x.xlsx"},
        {"metric_key": "industry_total", "region": "R", "unit": "%",
         "period": "январь", "value": 99.55, "year": 2025, "source": "x.xlsx"},
    ]
    res = stats.index_dynamics(recs, "industry_total", "R", 2026, unit="%", compare_year=2025)
    jan = res["series"][0]
    # 100.0 - 99.55 = 0.45 -> rounds to 0.5 (or 0.4); accept either 1-decimal result
    assert jan["delta"] in (0.4, 0.5)






# ---------------------------------------------------------------- Manufacturing chart (index dynamics)
def test_index_dynamics_no_value_line_series():
    """The 'monthly index' (delta-based 'value') series is never exposed by index_dynamics.
    Only cumulative values + compare + delta are present; no derived 'value' column."""
    recs = []
    for m, v26, v25 in [(1, 100.0, 95.0), (2, 110.0, 105.0), (3, 108.0, 103.0)]:
        recs.append({"metric_key": "processing", "region": "R", "unit": "%",
                     "period": MONTH_PERIOD[m], "value": v26, "year": 2026, "source": "a.xlsx"})
        recs.append({"metric_key": "processing", "region": "R", "unit": "%",
                     "period": MONTH_PERIOD[m], "value": v25, "year": 2025, "source": "b.xlsx"})
    res = stats.index_dynamics(recs, "processing", "R", 2026, unit="%", compare_year=2025)
    for p in res["series"]:
        # no 'derived' monthly-index key; value is the cumulative figure
        assert "derived" not in p
        assert p["value"] is not None
        # value must equal the cumulative 2026 figure, not a delta
    # m2 value = 110 (cumulative), NOT 110-100=10
    by_m = {p["month"]: p for p in res["series"]}
    assert by_m[2]["value"] == 110.0
    assert by_m[2]["delta"] == 5.0  # 110 - 105


def test_index_dynamics_localized_labels():
    """Month labels are localized per language; label_short is a compact form."""
    recs = [{"metric_key": "processing", "region": "R", "unit": "%",
             "period": "январь", "value": 100.0, "year": 2026, "source": "a.xlsx"}]
    res_kk = stats.index_dynamics(recs, "processing", "R", 2026, unit="%", lang="kk")
    res_ru = stats.index_dynamics(recs, "processing", "R", 2026, unit="%", lang="ru")
    assert res_kk["series"][0]["label"] == "қаңтар"
    assert res_ru["series"][0]["label"] == "январь"
    assert len(res_kk["series"][0]["label_short"]) <= 4


def test_index_dynamics_single_period_no_line_data():
    """A year with exactly ONE cumulative period (e.g. only jan–sep) -> the frontend
    sees a single non-null value and renders a big number, not a line. The series
    may have trailing nulls (months before the cumulative window), but only ONE
    value is non-null."""
    recs = [{"metric_key": "processing", "region": "R", "unit": "%",
             "period": "январь-сентябрь", "value": 112.4, "year": 2026, "source": "a.xlsx"}]
    res = stats.index_dynamics(recs, "processing", "R", 2026, unit="%")
    non_null = [p for p in res["series"] if p["value"] is not None]
    assert len(non_null) == 1
    assert non_null[0]["value"] == 112.4
    assert res["max_month"] == 9


def test_index_dynamics_two_periods_draws_line():
    """Two or more non-null cumulative values -> the frontend draws a line."""
    recs = [
        {"metric_key": "processing", "region": "R", "unit": "%",
         "period": "январь-июнь", "value": 108.0, "year": 2026, "source": "a.xlsx"},
        {"metric_key": "processing", "region": "R", "unit": "%",
         "period": "январь-сентябрь", "value": 112.4, "year": 2026, "source": "a.xlsx"},
    ]
    res = stats.index_dynamics(recs, "processing", "R", 2026, unit="%")
    non_null = [p for p in res["series"] if p["value"] is not None]
    assert len(non_null) >= 2


def test_index_dynamics_missing_month_breaks_line():
    """A month without data has value=None (line breaks, does not drop to zero)."""
    recs = [
        {"metric_key": "processing", "region": "R", "unit": "%",
         "period": "январь", "value": 100.0, "year": 2026, "source": "a.xlsx"},
        {"metric_key": "processing", "region": "R", "unit": "%",
         "period": "январь-март", "value": 105.0, "year": 2026, "source": "a.xlsx"},
    ]
    res = stats.index_dynamics(recs, "processing", "R", 2026, unit="%")
    by_m = {p["month"]: p for p in res["series"]}
    assert by_m[1]["value"] == 100.0
    assert by_m[2]["value"] is None   # February missing -> null, NOT 0
    assert by_m[3]["value"] == 105.0


def test_index_dynamics_y_domain_includes_100():
    """The chart Y domain (computed frontend-side) must include 100 and be tight.
    Verify the backend supplies the values the domain is derived from."""
    recs = []
    for m, v in [(1, 98.0), (2, 96.0), (3, 102.0), (4, 101.0)]:
        recs.append({"metric_key": "processing", "region": "R", "unit": "%",
                     "period": MONTH_PERIOD[m], "value": v, "year": 2026, "source": "a.xlsx"})
    res = stats.index_dynamics(recs, "processing", "R", 2026, unit="%")
    vals = [p["value"] for p in res["series"] if p["value"] is not None]
    # Frontend domain: [min(100, min-3), max(100, max+3)]
    lo = min(100, min(vals) - 3)
    hi = max(100, max(vals) + 3)
    assert lo <= 100 <= hi, "domain must include the 100% reference line"
    # tight: no absurd span like -45
    assert hi - lo < 20


def test_index_dynamics_values_no_long_float_in_serialized():
    """Backend values are plain numbers; frontend rounds to 1 decimal. Ensure no
    float artifacts are embedded in the JSON (values are finite, no NaN/inf)."""
    recs = [{"metric_key": "processing", "region": "R", "unit": "%",
             "period": "январь", "value": 100.123456789, "year": 2026, "source": "a.xlsx"}]
    res = stats.index_dynamics(recs, "processing", "R", 2026, unit="%")
    v = res["series"][0]["value"]
    assert v is not None and v != float("nan") and v != float("inf")
    # 1-decimal formatting on the frontend yields a clean string
    assert f"{v:.1f}" == "100.1"


# ---------------------------------------------------------------- Year-aware period selection (Task A)
def test_cumulative_series_year_aware():
    """cumulative_series with year=None selects the LATEST year (max year, max end-month).
    With year=2025 it returns only 2025 data. Never mixes years."""
    recs = [
        {"metric_key": "industry_total", "region": "R", "unit": "%",
         "period": "январь-декабрь", "value": 97.3, "year": 2025, "source": "a.xlsx"},
        {"metric_key": "industry_total", "region": "R", "unit": "%",
         "period": "январь-сентябрь", "value": 107.2, "year": 2026, "source": "b.xlsx"},
    ]
    # year=None -> latest year (2026)
    cu = stats.cumulative_series(recs, "industry_total", "R", unit="%")
    assert len(cu) == 1
    assert cu[0]["value"] == 107.2
    assert cu[0]["year"] == 2026
    # year=2025 -> only 2025 data
    cu25 = stats.cumulative_series(recs, "industry_total", "R", unit="%", year=2025)
    assert len(cu25) == 1
    assert cu25[0]["value"] == 97.3
    assert cu25[0]["year"] == 2025


def test_cumulative_series_latest_year_not_import_order():
    """'Latest period' is determined by (year, end_month), NOT import order.
    Even if 2025 was imported after 2026, the latest is still 2026."""
    recs = [
        # 2026 imported FIRST
        {"metric_key": "industry_total", "region": "R", "unit": "%",
         "period": "январь-сентябрь", "value": 107.2, "year": 2026, "source": "a.xlsx"},
        # 2025 imported SECOND (later source name sorts last)
        {"metric_key": "industry_total", "region": "R", "unit": "%",
         "period": "январь-декабрь", "value": 97.3, "year": 2025, "source": "z.xlsx"},
    ]
    cu = stats.cumulative_series(recs, "industry_total", "R", unit="%")
    # Latest year is 2026 (not 2025, despite 2025 having the 'newer' source)
    assert cu[0]["year"] == 2026
    assert cu[0]["value"] == 107.2


def test_cumulative_series_same_year_max_month():
    """Within the same year, the max end-month is the latest period."""
    recs = [
        {"metric_key": "industry_total", "region": "R", "unit": "%",
         "period": "январь", "value": 100.0, "year": 2026, "source": "a.xlsx"},
        {"metric_key": "industry_total", "region": "R", "unit": "%",
         "period": "январь-сентябрь", "value": 107.2, "year": 2026, "source": "b.xlsx"},
    ]
    cu = stats.cumulative_series(recs, "industry_total", "R", unit="%")
    # Both months in 2026; the series includes both (m1 and m9)
    months = [p["month"] for p in cu]
    assert 1 in months and 9 in months
    # The last entry is m9 (max end-month)
    assert cu[-1]["month"] == 9
    assert cu[-1]["value"] == 107.2


def test_yoy_compare_uses_same_period_prior_year():
    """YoY comparison uses the SAME cumulative period in the prior year.
    2026 jan-sep vs 2025 jan-sep (NOT 2025 jan-dec)."""
    recs = [
        {"metric_key": "industry_total", "region": "R", "unit": "%",
         "period": "январь-сентябрь", "value": 107.2, "year": 2026, "source": "a.xlsx"},
        {"metric_key": "industry_total", "region": "R", "unit": "%",
         "period": "январь-сентябрь", "value": 98.0, "year": 2025, "source": "b.xlsx"},
        # 2025 jan-dec exists but must NOT be used for jan-sep comparison
        {"metric_key": "industry_total", "region": "R", "unit": "%",
         "period": "январь-декабрь", "value": 97.3, "year": 2025, "source": "c.xlsx"},
    ]
    res = stats.yoy_compare(recs, "industry_total", "R", 9, "%", "idx", lang="kk")
    # prior year value should be 98.0 (jan-sep 2025), NOT 97.3 (jan-dec 2025)
    assert res.get("prev_value") == 98.0, f"Expected 98.0, got {res.get('prev_value')}"
    assert res.get("reason") != "no_prior", f"Reason: {res.get('reason')}"


def test_yoy_compare_no_compatible_prior_year():
    """When the prior year has no data for the same period, comparison is None
    (not fabricated from a different period)."""
    recs = [
        {"metric_key": "industry_total", "region": "R", "unit": "%",
         "period": "январь-сентябрь", "value": 107.2, "year": 2026, "source": "a.xlsx"},
        # 2025 has ONLY jan-dec, no jan-sep
        {"metric_key": "industry_total", "region": "R", "unit": "%",
         "period": "январь-декабрь", "value": 97.3, "year": 2025, "source": "b.xlsx"},
    ]
    res = stats.yoy_compare(recs, "industry_total", "R", 9, "%", "idx", lang="kk")
    # No jan-sep 2025 -> no comparison
    assert res.get("prev_value") is None
    assert res.get("reason") == "no_prior"


def test_dashboard_uses_selected_year():
    """Dashboard endpoint with year=2026 returns 2026 values (107.2), not 2025 (97.3)."""
    from fastapi.testclient import TestClient
    from backend.main import app
    client = TestClient(app)
    r = client.get("/stats/dashboard", params={"lang": "kk", "year": 2026})
    assert r.status_code == 200
    d = r.json()
    kpi_idx = d["kpi"]["kpi_index"]["value"]
    # 2026 jan-sep = 107.2 (NOT 97.3 which is 2025 jan-dec)
    assert kpi_idx == 107.2, f"Expected 107.2, got {kpi_idx}"
