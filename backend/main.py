# -*- coding: utf-8 -*-
"""QYZYLORDA INDUSTRIAL INTELLIGENCE — FastAPI application.

API under /api (mounted by app.py). Groups:
  auth, i18n, settings, users
  stats (dashboard, industrial, manufacturing, district)
  forecasting
  documents (upload, analyze, compare, import, export)  [Document Intelligence]
  ai (analyst Q&A)
  comparative
  data management (bulk import with validation)
  sources, reports, audit
"""
import os
import re
import time
import uuid
import json
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from backend import store
from backend.analysis import parsers, stats, forecast as fcast, compare as cmp_mod
from backend.analysis.extract import extract_records
from backend.analysis.ai import build_summary, build_findings, answer_question
from backend.analysis.reports import export_pdf, export_xlsx
from backend.analysis.i18n import STRINGS, LANGS
from backend.analysis.common import month_number, norm_region, metric_key_for

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORTS = store.REPORTS
os.makedirs(REPORTS, exist_ok=True)

app = FastAPI(title="QYZYLORDA INDUSTRIAL INTELLIGENCE", version="2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
store.init_site_db()

# --- Report Intake module (independent, feature-flagged) -----------------
# Registered here; each endpoint also re-checks the flag, so when disabled the
# whole module is closed (403). No existing endpoint above is touched.
from backend.app.modules.report_intake import api as _ri_api
app.include_router(_ri_api.router)


# ---------------------------------------------------------------- seasonality calendar
# Manual, admin-only. Only affects alert rules / comparison text / explanations —
# never recomputes or adjusts official ministry figures. Empty by default.
# NOTE: registered after `require` is defined (below in the auth section) via
# _register_seasonal_endpoints(); see the function near the bottom of this file.
@app.get("/seasonal")
def seasonal_list():
    return {"calendar": store.get_seasonal_calendar()}


# ---------------------------------------------------------------- auth
def _current_user(req: Request):
    auth = req.headers.get("Authorization", "")
    token = auth.split()[-1] if auth else req.query_params.get("token")
    if not token:
        return None
    sess = store.get_session(token)
    if not sess:
        return None
    return store.get_user(sess["user_id"])


def require(perm):
    def dep(req: Request):
        user = _current_user(req)
        if user is None:
            raise HTTPException(401, "unauthorized")
        if not store.has_perm(user, perm):
            raise HTTPException(403, f"forbidden: needs '{perm}'")
        return user
    return dep


def optional_user(req: Request):
    return _current_user(req)


# Seasonal calendar write endpoint (admin only) — registered here because it needs
# `require`, which is defined just above.
@app.put("/seasonal")
def seasonal_save(payload: dict, _u=Depends(require("manage_users"))):
    cal = payload.get("calendar")
    if not isinstance(cal, list):
        raise HTTPException(400, "calendar must be a list")
    # light validation: metric must be a known key, active_months within 1..12
    from backend.analysis.stats import METRIC_KEYS
    cleaned = []
    for e in cal:
        if not isinstance(e, dict):
            continue
        metric = e.get("metric")
        if metric not in METRIC_KEYS:
            raise HTTPException(400, f"unknown metric: {metric}")
        months = [int(m) for m in (e.get("active_months") or []) if isinstance(m, (int, float)) or (str(m).isdigit())]
        months = [m for m in months if 1 <= m <= 12]
        cleaned.append({
            "id": str(e.get("id") or f"sn_{len(cal)}_{metric}"),
            "metric": metric,
            "region": e.get("region") or None,   # None = all districts
            "active_months": months,
            "nature": e.get("nature") or "",
            "note": e.get("note") or "",
            "added_by": _u.get("username", ""),
            "created_at": e.get("created_at") or "",
        })
    store.save_seasonal_calendar(cleaned)
    return {"calendar": cleaned}


@app.post("/auth/login")
def login(payload: dict):
    u = store.get_user_by_username(payload.get("username", ""))
    if not u or not store.verify_password(payload.get("password", ""), u["password_hash"]):
        raise HTTPException(401, "invalid credentials")
    token = store.create_session(u["id"])
    store.audit("login", None, u["username"], u["username"])
    return {"token": token, "user": {k: u[k] for k in ("id", "username", "name", "role", "lang")}}


@app.post("/auth/logout")
def logout(user=Depends(require("view"))):
    token = store.get_session and None  # token from header handled below
    return {"ok": True}


@app.get("/auth/me")
def me(user=Depends(optional_user)):
    if not user:
        return {"user": None}
    return {"user": {k: user[k] for k in ("id", "username", "name", "role", "lang")},
            "permissions": store.permissions_for(user.get("role"))}


# ---------------------------------------------------------------- i18n / settings / users
@app.get("/health")
def health():
    return {"ok": True, "records": len(store.get_site_db()), "docs": len(store.get_documents())}


@app.get("/i18n/{lang}")
def i18n(lang: str):
    if lang not in LANGS:
        lang = "ru"
    return STRINGS[lang]


@app.get("/settings")
def get_settings():
    s = store.get_settings()
    return {k: v for k, v in s.items()}


@app.put("/settings")
def put_settings(payload: dict, user=Depends(require("manage_users"))):
    s = store.get_settings()
    s.update(payload)
    store.save_settings(s)
    store.audit("settings_update", None, payload, user["username"])
    return s


@app.get("/reports/config")
def reports_config():
    """Read-only feature flags for the Reports page (no auth needed to read)."""
    s = store.get_settings()
    return {"forecast_report_enabled": bool(s.get("forecast_report_enabled", False))}


@app.put("/reports/config")
def put_reports_config(payload: dict, user=Depends(require("manage_users"))):
    """Admin toggles report feature flags (e.g. enable the forecast report)."""
    s = store.get_settings()
    if "forecast_report_enabled" in payload:
        s["forecast_report_enabled"] = bool(payload["forecast_report_enabled"])
    store.save_settings(s)
    store.audit("reports_config_update", None, payload, user["username"])
    return {"forecast_report_enabled": bool(s.get("forecast_report_enabled", False))}


@app.get("/users")
def list_users(user=Depends(require("manage_users"))):
    return [{k: u[k] for k in ("id", "username", "name", "role", "lang", "active")} for u in store.get_users()]


@app.put("/users/{uid}")
def update_user(uid: str, payload: dict, user=Depends(require("manage_users"))):
    users = store.get_users()
    for u in users:
        if u["id"] == uid:
            for k in ("name", "role", "lang", "active"):
                if k in payload:
                    u[k] = payload[k]
            store.save_users(users)
            store.audit("user_update", None, f"{uid} {payload}", user["username"])
            return {k: u[k] for k in ("id", "username", "name", "role", "lang", "active")}
    raise HTTPException(404, "user not found")


# ---------------------------------------------------------------- stats
def _db():
    return store.get_site_db()


@app.get("/stats/dashboard")
def dashboard(lang: str = "ru", year: int = 2026):
    all_recs = [r for r in _db()]
    recs = [r for r in all_recs if r.get("year", year) == year]
    kpi = stats.kpis(recs, lang=lang)
    ind_trend = stats.cumulative_series(recs, "industry_total", "Кызылординская область", unit="%")
    mfg_trend = stats.cumulative_series(recs, "processing", "Кызылординская область", unit="%")
    structure = stats.industry_structure(recs, month=9, lang=lang)
    districts = stats.district_table(recs, "industry_total", month=9, unit="%", lang=lang)
    flagged = stats.anomaly_flags(districts)
    for d in districts:
        d["needs_review"] = d["region"] in flagged
    # enriched KPI cards with honest units + YoY vs same cumulative period prior year
    reg = "Кызылординская область"
    def kpi_card(metric, unit, kind):
        rec = _value_at(recs, metric, reg, 9, unit=unit)
        if not rec:
            return {"value": None, "unit": None, "source": None, "change": None,
                    "change_pct": None, "prior_year": None, "yoy_reason": "no_current"}
        yoy = stats.yoy_compare(all_recs, metric, reg, 9, unit, kind, lang=lang)
        base = {"value": None, "unit": None, "source": None, "raw": None}
        if kind == "vol":
            dv, du = stats.format_volume(rec["value"], rec["unit"], lang)
            base.update({"value": dv, "unit": du, "raw": rec["value"]})
        else:
            base.update({"value": rec["value"], "unit": "%", "raw": rec["value"]})
        base["source"] = rec["source"]
        base.update({"change": yoy.get("change"), "change_pct": yoy.get("change_pct"),
                     "prior_year": yoy.get("prior_year"), "yoy_reason": yoy.get("reason"),
                     "prev_value": yoy.get("prev_value")})
        return base
    kpi_cards = {
        "volume": kpi_card("industry_total", "тыс. теңге", "vol"),
        "index": kpi_card("industry_total", "%", "idx"),
        "mfg_output": kpi_card("processing", "тыс. теңге", "vol"),
        "mfg_index": kpi_card("processing", "%", "idx"),
    }
    # top growth sector/district for the summary (real data)
    top_growth = _top_growth(recs, lang)
    summary = stats.build_summary(all_recs, lang)
    if top_growth:
        summary.append({"key": "top_growth", "metric": top_growth["key"],
                        "value": top_growth["change"], "period": None,
                        "text": f"{top_growth['label']}: {stats._signed(top_growth['change'], lang)} п.п. {tr_vs(top_growth.get('prior_year'), lang)}",
                        "source": None})
    return {"kpi": kpi, "kpi_cards": kpi_cards, "summary": [s for s in summary if s],
            "industrial_trend": ind_trend, "mfg_trend": mfg_trend,
            "structure": structure, "districts": districts[:10],
            "alerts": stats.build_alerts(recs, lang),
            "top_growth": top_growth,
            "last_update": _last_import_ts(),
            "year": year, "lang": lang}


def tr_vs(prior_year, lang):
    from backend.analysis.i18n import STRINGS
    tr = STRINGS.get(lang, STRINGS["ru"])
    return tr.get("vs_prior_year", "к пред. году").format(y=prior_year) if prior_year else ""


def _top_growth(recs, lang):
    """Highest YoY index change among sectors for the region (real data only)."""
    reg = "Кызылординская область"
    best = None
    for mk in ["mining", "processing", "utility", "water"]:
        cur = _value_at(recs, mk, reg, 9, unit="%")
        if not cur or cur.get("value") is None:
            continue
        yoy = stats.yoy_compare([r for r in _db()], mk, reg, 9, "%", "idx", lang=lang)
        if yoy.get("change") is None:
            continue
        if best is None or abs(yoy["change"]) > abs(best["change"]):
            best = {"key": mk, "label": stats.metric_label(mk, lang), "change": yoy["change"],
                    "prior_year": yoy.get("prior_year")}
    return best


def _last_import_ts():
    """Real last data change: latest import ts, else None (never fabricated)."""
    imps = store.get_imports()
    if imps:
        return max(i.get("ts", 0) for i in imps) or None
    return None


def _value_at(recs, metric, region, month, unit=None):
    for r in recs:
        if r["metric_key"] == metric and r["region"] == region and month_number(r["period"]) == month:
            if unit is None or r["unit"] == unit:
                return r
    return None


@app.get("/stats/alerts")
def alerts(lang: str = "ru"):
    return stats.build_alerts(_db(), lang=lang)


@app.get("/stats/alerts/detailed")
def alerts_detailed(metric: Optional[str] = None, period_month: int = 9,
                    threshold: Optional[float] = None, lang: str = "ru", year: Optional[int] = None):
    """Period-scoped detailed alerts (anomalies + missing). Read-only.
    Never treats empty as zero; anomalies are neutral 'needs review'.
    Severity thresholds (p.p.) come from settings unless overridden.
    `year` filters the current-period data; prior-year comparison uses year-1."""
    s = store.get_settings()
    th_high = s.get("alert_threshold_high", 25.0)
    th_med = s.get("alert_threshold_medium", 15.0)
    th_pp = s.get("alert_threshold_pp", 25.0)
    recs = _db()
    if year:
        recs = [r for r in recs if r.get("year") == year]
    return stats.build_alerts_detailed(recs, lang=lang, period_month=period_month,
                                       threshold=th_high, threshold_medium=th_med,
                                       threshold_pp=th_pp)


# anomaly decisions stored separately (do not alter site_db)
def _decisions():
    import os, json
    p = os.path.join(store.DATA, "anomaly_decisions.json")
    if not os.path.exists(p):
        return {}
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)

def _save_decisions(d):
    import os, json
    with open(os.path.join(store.DATA, "anomaly_decisions.json"), "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1, default=str)

@app.post("/stats/alerts/decision")
def anomaly_decision(payload: dict, user=Depends(require("analyze"))):
    """Record a reviewer's decision for an anomaly. Roles enforced (server-side).
    Decision + note + author + time go to the audit journal; the original value
    is never changed. Only changes the anomaly's status (stored separately)."""
    key = f"{payload.get('metric')}|{payload.get('region')}|{payload.get('period_month')}"
    action = payload.get("action")  # checked_ok | send_fix | note
    note = payload.get("note")
    if action not in ("checked_ok", "send_fix", "note"):
        raise HTTPException(400, "action must be checked_ok|send_fix|note")
    status = {"checked_ok": "reviewed_ok", "send_fix": "sent_fix", "note": "needs_review"}[action]
    d = _decisions()
    d[key] = {"status": status, "note": note, "by": user.get("username"),
              "role": user.get("role"), "ts": time.time(),
              "metric": payload.get("metric"), "region": payload.get("region"),
              "period_month": payload.get("period_month")}
    _save_decisions(d)
    store.audit("anomaly_decision", user=user, detail={"key": key, "action": action, "status": status})
    return {"key": key, "status": status}

@app.get("/stats/alerts/decisions")
def anomaly_decisions():
    return _decisions()


@app.get("/stats/industrial")
def industrial(metric: str = "industry_total", unit: str = "%", region: Optional[str] = None,
               lang: str = "ru", year: Optional[int] = None):
    region = region or "Кызылординская область"
    recs = _db()
    cu = stats.cumulative_series(recs, metric, region, unit=unit, year=year, lang=lang)
    mo, valid, note = stats.monthly_series(recs, metric, region, unit=unit)
    # YoY: only if a prior-year series exists
    return {"metric": metric, "region": region, "unit": unit, "year": cu[0]["year"] if cu else year,
            "cumulative": cu, "monthly": mo, "monthly_valid": valid, "note": note,
            "label": stats.metric_label(metric, lang),
            "region_label": stats.region_label(region, lang)}


@app.get("/stats/index_dynamics")
def index_dynamics(metric: str = "industry_total", region: Optional[str] = None,
                   year: int = 2026, compare_year: Optional[int] = None, unit: str = "%",
                   lang: str = "ru"):
    """Cumulative INDEX dynamics. Never differs indexes into a monthly index.
    One line for `year`, one (dashed) for `compare_year` (same months)."""
    region = region or "Кызылординская область"
    res = stats.index_dynamics(_db(), metric, region, year, unit=unit, compare_year=compare_year, lang=lang)
    res.update({"metric": metric, "region": region, "unit": unit,
                "label": stats.metric_label(metric, lang),
                "region_label": stats.region_label(region, lang)})
    return res


@app.get("/stats/volume_monthly")
def volume_monthly(metric: str = "industry_total", region: Optional[str] = None,
                   year: int = 2026, compare_year: Optional[int] = None,
                   unit: str = "тыс. теңге", lang: str = "ru"):
    """Monthly VOLUME derived by differencing adjacent cumulative volumes.
    Only valid for volume (not index). Missing adjacent period -> null (never 0)."""
    region = region or "Кызылординская область"
    res = stats.volume_monthly(_db(), metric, region, year, unit=unit, compare_year=compare_year, lang=lang)
    res.update({"metric": metric, "region": region, "unit": unit,
                "label": stats.metric_label(metric, lang),
                "region_label": stats.region_label(region, lang)})
    return res


@app.get("/stats/manufacturing")
def manufacturing(unit: str = "%", region: Optional[str] = None, lang: str = "ru"):
    return industrial(metric="processing", unit=unit, region=region, lang=lang)


@app.get("/stats/industries")
def industries(region: Optional[str] = None, lang: str = "ru"):
    region = region or "Кызылординская область"
    recs = [r for r in _db()]
    sectors = stats.industry_sectors(recs, region, lang=lang)
    return {"region": region, "region_label": stats.region_label(region, lang),
            "sectors": sectors}


@app.get("/stats/periods")
def periods(metric: str = "industry_total", unit: str = "%", lang: str = "ru"):
    """Distinct (year, period) pairs available for a metric+unit, chronological."""
    recs = _db()
    ps = stats.available_periods(recs, metric, unit)
    out = []
    for period in ps:
        year = max((r.get("year") or 0) for r in recs
                   if r["metric_key"] == metric and (not unit or r["unit"] == unit) and r["period"] == period)
        out.append({"period": period, "year": year, "label": period})
    return {"metric": metric, "unit": unit, "periods": out}


@app.get("/stats/district_compare")
def district_compare(metric: str = "industry_total", period: str = "январь-сентябрь",
                     year: int = 2026, compare_year: Optional[int] = None,
                     compare_period: Optional[str] = None, unit: str = "%", lang: str = "ru"):
    """One-period district table with compatible prior-year comparison.
    `compare_period` (optional) selects the exact prior-year period; delta is
    computed only for compatible cumulative windows (same end month)."""
    recs = _db()
    res = stats.district_compare(recs, metric, unit, period, year, compare_year, compare_period, lang=lang)
    return res


@app.get("/stats/district")
def district(metric: str = "industry_total", month: int = 9, unit: str = "%", lang: str = "ru", year: Optional[int] = None):
    recs = _db()
    if year:
        recs = [r for r in recs if r.get("year") == year]
    rows = stats.district_table(recs, metric, month=month, unit=unit, lang=lang)
    return {"metric": metric, "month": month, "unit": unit, "year": year, "rows": rows}


@app.get("/stats/district/{region}")
def district_detail(region: str, lang: str = "ru"):
    recs = _db()
    out = {}
    for mk in ["industry_total", "mining", "processing", "utility", "water"]:
        out[mk] = stats.cumulative_series(recs, mk, region, unit="%")
    out["region"] = region
    out["label"] = stats.region_label(region, lang)
    return out


# ---------------------------------------------------------------- forecasting
def _require_forecast():
    if not store.get_settings().get("forecast_enabled", False):
        raise HTTPException(403, "forecasting module is disabled")


@app.get("/forecast/availability")
def forecast_availability(metric: str = "industry_total", region: str = "Кызылординская область",
                          unit: str = "%", lang: str = "ru"):
    """Read-only helper for the forecast filter card. Requires the forecasting
    feature flag (default off). It does NOT run any forecast and does not alter
    existing endpoints."""
    _require_forecast()
    recs = _db()
    mo, valid, note = stats.monthly_series(recs, metric, region, unit=unit)
    have = len([p for p in mo if p.get("value") is not None]) if valid else 0
    suff = fcast.check_sufficiency(mo, horizon=6) if valid else {"n": 0, "need": 24, "sufficient": False, "reason": "too_few_points"}
    need = suff.get("need", 24)
    possible = bool(suff.get("sufficient"))
    horizons = [{"h": h, "ok": bool(valid and have >= (fcast.MIN_POINTS_HORIZON.get(h, 24) if hasattr(fcast, "MIN_POINTS_HORIZON") else 24))}
                for h in (1, 3, 6, 12)]
    return {
        "metric": metric, "region": region,
        "metric_label": stats.metric_label(metric, lang),
        "region_label": stats.region_label(region, lang),
        "months_available": have, "required_months": need,
        "possible": possible, "horizons": horizons,
    }


@app.post("/forecast")
def run_forecast(payload: dict, user=Depends(require("forecast"))):
    _require_forecast()
    metric = payload.get("metric", "industry_total")
    region = payload.get("region", "Кызылординская область")
    unit = payload.get("unit", "%")
    horizon = int(payload.get("horizon", 6))
    if horizon not in (1, 3, 6, 12, 24):
        raise HTTPException(400, "horizon must be 1,3,6,12 or 24")
    recs = _db()
    mo, valid, note = stats.monthly_series(recs, metric, region, unit=unit)
    if not valid or not mo:
        run = {"id": uuid.uuid4().hex[:10], "ts": time.time(), "available": False,
               "error": note, "explanation": "insufficient_data",
               "sufficiency": fcast.check_sufficiency(mo, horizon)}
        return run
    run = fcast.run_forecast(mo, horizon=horizon, lang=payload.get("lang", "ru"))
    run["metric"] = metric
    run["region"] = region
    run["unit"] = unit
    run["metric_label"] = stats.metric_label(metric, payload.get("lang", "ru"))
    store.record_forecast(run)
    return run


@app.get("/forecast")
def list_forecasts():
    _require_forecast()
    return store.get_forecasts()


@app.get("/forecast/{run_id}")
def get_forecast(run_id: str):
    _require_forecast()
    r = store.get_forecast(run_id)
    if not r:
        raise HTTPException(404, "not found")
    return r


# ---------------------------------------------------------------- documents (Document Intelligence)
@app.post("/upload")
async def upload(file: UploadFile = File(...), user=Depends(optional_user)):
    doc_id = uuid.uuid4().hex[:10]
    safe_name = re.sub(r"[^A-Za-z0-9._\-\u0400-\u04FF\u04D0-\u04FF ]", "_", file.filename or "file").strip()
    dest = os.path.join(store.UPLOADS, f"{doc_id}_{safe_name}")
    with open(dest, "wb") as f:
        data = await file.read()
        f.write(data)
    ok, code, msg = parsers.validate_file(dest, safe_name)
    if not ok:
        os.remove(dest)
        store.audit("upload_rejected", doc_id, code, user["username"] if user else None)
        raise HTTPException(400, detail={"code": code, "message": msg})
    digest = store.sha256(dest)
    docs = store.get_documents()
    dup = next((d for d in docs if d.get("sha256") == digest and d["status"] != "error"), None)
    doc = {
        "id": doc_id, "filename": file.filename or safe_name, "size": len(data),
        "sha256": digest, "uploaded_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "uploaded_by": user["username"] if user else "anonymous",
        "status": "uploaded", "records": [], "meta": {}, "comparison": None,
        "duplicate_of": dup["id"] if dup else None,
    }
    store.upsert_document(doc)
    store.register_source({"sha256": digest, "doc": doc["filename"], "ts": time.time(),
                           "period": None, "org": "upload", "status": "unverified"})
    store.audit("upload", doc_id, file.filename, user["username"] if user else None)
    return doc


def _doc_path(doc):
    p = os.path.join(store.UPLOADS, f"{doc['id']}_{doc['filename']}")
    if os.path.exists(p):
        return p
    try:
        matches = [f for f in os.listdir(store.UPLOADS) if f.startswith(doc["id"] + "_")]
        if matches:
            return os.path.join(store.UPLOADS, matches[0])
    except OSError:
        pass
    return None


def _get_doc(doc_id):
    return store.get_document(doc_id)


@app.post("/analyze/{doc_id}")
def analyze(doc_id: str, user=Depends(optional_user)):
    doc = _get_doc(doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    path = _doc_path(doc)
    if not path:
        raise HTTPException(404, "file missing on disk")
    doc["status"] = "processing"
    store.upsert_document(doc)
    try:
        parsed = parsers.parse_any(path, doc["filename"])
        records, meta = extract_records(parsed, doc["filename"])
        db = store.get_site_db()
        comp = cmp_mod.compare(records, db)
        status = "done"
        if meta.get("warnings") or parsed.get("warnings"):
            status = "review"
        doc.update({"status": status, "records": records,
                    "meta": {**meta, "parse_warnings": parsed.get("warnings", [])},
                    "comparison": comp, "analyzed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "error": None})
        store.audit("analyze", doc_id, f"{len(records)} records, status={status}",
                    user["username"] if user else None)
    except Exception as e:
        doc["status"] = "error"
        doc["error"] = str(e)
        store.audit("analyze_error", doc_id, str(e), user["username"] if user else None)
        store.upsert_document(doc)
        raise HTTPException(500, detail=str(e))
    store.upsert_document(doc)
    return doc


@app.get("/documents")
def documents():
    return store.get_documents()


@app.get("/documents/{doc_id}")
def get_document(doc_id: str):
    d = _get_doc(doc_id)
    if not d:
        raise HTTPException(404, "not found")
    return d


@app.delete("/documents/{doc_id}")
def delete_document(doc_id: str, user=Depends(optional_user)):
    doc = _get_doc(doc_id)
    if not doc:
        raise HTTPException(404, "not found")
    if user and not store.has_perm(user, "import"):
        raise HTTPException(403, "forbidden")
    p = _doc_path(doc)
    if p and os.path.exists(p):
        os.remove(p)
    store.delete_document(doc_id)
    store.audit("delete", doc_id, doc["filename"], user["username"] if user else None)
    return {"ok": True}


@app.get("/ai/{doc_id}")
def ai_analysis(doc_id: str, lang: str = "ru"):
    d = _get_doc(doc_id)
    if not d:
        raise HTTPException(404, "not found")
    summary = build_summary(d, d.get("meta", {}), d.get("comparison") or {}, lang=_norm_lang(lang))
    findings = build_findings(d.get("records", []), d.get("comparison") or {}, lang=_norm_lang(lang))
    return {"summary": summary, "findings": findings}


@app.post("/ai/ask")
def ai_analyst(payload: dict, user=Depends(optional_user)):
    """Grounded AI analyst over the site DB (and optional document)."""
    question = payload.get("question", "")
    lang = _norm_lang(payload.get("lang", "ru"))
    db = store.get_site_db()
    comp = payload.get("comparison") or {}
    doc_records = payload.get("records") or []
    res = answer_question(question, doc_records, db, comp, lang=lang)
    return res


def _norm_lang(lang):
    # backend AI uses kz/ru/en; map kk->kz
    return "kz" if lang == "kk" else (lang if lang in ("ru", "en") else "ru")


@app.post("/import/{doc_id}")
def do_import(doc_id: str, payload: dict, user=Depends(require("import"))):
    d = _get_doc(doc_id)
    if not d:
        raise HTTPException(404, "not found")
    if not payload.get("confirmed"):
        raise HTTPException(400, "confirmation required")
    recs = payload.get("records", [])
    db = store.get_site_db()
    added, skipped = 0, 0
    existing = {(r["metric_key"], r["region"], r.get("period"), r.get("unit"), r.get("year")) for r in db}
    for r in recs:
        key = (r.get("metric_key"), r.get("region"), r.get("period"), r.get("unit"), r.get("year"))
        if key in existing:
            skipped += 1
            continue
        db.append({"metric_key": r.get("metric_key"), "metric_name": r.get("metric_name"),
                   "unit": r.get("unit"), "region": r.get("region"), "year": r.get("year"),
                   "period": r.get("period"), "value": r.get("value"),
                   "source": f"import: {d['filename']}", "source_sheet": r.get("source_sheet", ""),
                   "confidence": "imported", "updated": time.time()})
        existing.add(key)
        added += 1
    store.save_site_db(db)
    store.record_import(doc_id, recs, decided_by=user["username"])
    store.audit("import", doc_id, f"added={added} skipped={skipped}", user["username"])
    return {"added": added, "skipped_existing": skipped}


@app.get("/export/{doc_id}/{kind}")
def export_report(doc_id: str, kind: str, lang: str = "ru"):
    d = _get_doc(doc_id)
    if not d:
        raise HTTPException(404, "not found")
    comp = d.get("comparison") or {"matched": [], "discrepancies": [], "new_in_document": [], "missing_in_document": []}
    summary = build_summary(d, d.get("meta", {}), comp, lang=_norm_lang(lang))
    findings = build_findings(d.get("records", []), comp, lang=_norm_lang(lang))
    stamp = time.strftime("%Y%m%d_%H%M")
    if kind == "pdf":
        path = os.path.join(REPORTS, f"report_{doc_id}_{stamp}.pdf")
        export_pdf(d, comp, summary, findings, path)
        return FileResponse(path, media_type="application/pdf", filename=f"DI_report_{doc_id}.pdf")
    if kind == "xlsx":
        path = os.path.join(REPORTS, f"report_{doc_id}_{stamp}.xlsx")
        export_xlsx(d, d.get("records", []), comp, path)
        return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            filename=f"DI_report_{doc_id}.xlsx")
    raise HTTPException(400, "kind must be pdf or xlsx")


# ---------------------------------------------------------------- comparative analytics
@app.post("/comparative/run")
def comparative_run(payload: dict, user=Depends(optional_user)):
    """Compare two cuts of the DB: metric/region/month/unit pairs.
    payload: {metric, unit, region_a, region_b, month_a, month_b, lang}"""
    metric = payload.get("metric", "industry_total")
    unit = payload.get("unit", "%")
    ra, rb = payload.get("region_a"), payload.get("region_b")
    ma, mb = int(payload.get("month_a", 9)), int(payload.get("month_b", 8))
    lang = payload.get("lang", "ru")
    db = _db()

    def val(region, month):
        for r in db:
            if r["metric_key"] == metric and r["region"] == region and \
               month_number(r["period"]) == month and r["unit"] == unit:
                return r
        return None

    a, b = val(ra, ma), val(rb, mb)
    rows = []
    # If same region, compare two months; else compare two regions at same month
    if ra and rb and ra == rb:
        x, y = val(ra, ma), val(ra, mb)
        label_a, label_b = f"{ra} {ma}", f"{ra} {mb}"
        a, b = x, y
    rows = {
        "a": {"region": ra, "month": ma, "value": a["value"] if a else None,
              "unit": unit, "source": a["source"] if a else None} if a else
             {"region": ra, "month": ma, "value": None},
        "b": {"region": rb or ra, "month": mb, "value": b["value"] if b else None,
              "unit": unit, "source": b["source"] if b else None} if b else
             {"region": rb or ra, "month": mb, "value": None},
        "comparable": bool(a and b),
        "abs_diff": (a["value"] - b["value"]) if (a and b) else None,
        "pct_diff": ((a["value"] - b["value"]) / b["value"] * 100) if (a and b and b["value"]) else None,
        "metric": metric, "metric_label": stats.metric_label(metric, lang),
        "note": "Not comparable: missing value(s) in one side." if not (a and b) else None,
    }
    return rows


# ---------------------------------------------------------------- data management
FIELD_FIELDS = ["metric_key", "metric_name", "unit", "region", "year", "period", "value"]

@app.post("/data/preview")
async def data_preview(file: UploadFile = File(...), user=Depends(require("manage_data"))):
    safe = f"{uuid.uuid4().hex[:8]}_{(file.filename or 'file').replace('/', '_')}"
    dest = os.path.join(store.UPLOADS, safe)
    with open(dest, "wb") as f:
        data = await f.read()
        f.write(data)
    parsed = parsers.parse_any(dest, file.filename)
    tables = parsed.get("tables", [])
    # flatten first table to header + rows
    header, rows = [], []
    for t in tables:
        rows_ = t.get("rows") if isinstance(t, dict) else t
        if rows_:
            header = list(rows_[0]) if rows_[0] else []
            rows = [list(r) for r in rows_[1:]]
            break
    return {"filename": file.filename, "header": header, "rows": rows[:200],
            "total_rows": sum(len(t.get('rows', [])) - 1 for t in tables if isinstance(t, dict) and t.get('rows'))}


@app.post("/data/import")
def data_import(payload: dict, user=Depends(require("import"))):
    """Import mapped records. payload: {mapping, records, source_label, confirmed}
    mapping: {col_index_or_name: field} ; records: list of raw row dicts."""
    if not payload.get("confirmed"):
        raise HTTPException(400, "confirmation required")
    mapping = payload.get("mapping", {})
    records = payload.get("records", [])
    validated, rejected, dupes = [], [], 0
    existing = {(r["metric_key"], r["region"], r.get("period"), r.get("unit"), r.get("year"))
                for r in store.get_site_db()}
    for raw in records:
        rec, issues = _map_record(raw, mapping)
        issues = _validate_record(rec)
        if issues:
            rejected.append({"record": rec, "issues": issues})
            continue
        key = (rec["metric_key"], rec["region"], rec.get("period"), rec.get("unit"), rec.get("year"))
        if key in existing:
            dupes += 1
            continue
        existing.add(key)
        validated.append(rec)
    if validated:
        db = store.get_site_db()
        now = time.time()
        for r in validated:
            r.update({"source": payload.get("source_label", "data-management-import"),
                      "confidence": "imported", "updated": now})
        db.extend(validated)
        store.save_site_db(db)
        store.record_import("data-mgmt", validated, decided_by=user["username"],
                            note=payload.get("source_label"))
        store.audit("data_import", None, f"added={len(validated)} rejected={len(rejected)} dupes={dupes}",
                    user["username"])
    return {"added": len(validated), "rejected": rejected, "duplicates": dupes,
            "validated_sample": validated[:10]}


def _map_record(raw, mapping):
    rec = {}
    if isinstance(raw, dict):
        # mapping maps source key -> field
        for k, v in raw.items():
            field = mapping.get(k, k)
            if field in FIELD_FIELDS:
                rec[field] = v
    issues = []
    return rec, issues


def _validate_record(rec):
    issues = []
    if not rec.get("metric_key") or rec["metric_key"] not in ("industry_total", "mining", "processing", "utility", "water"):
        issues.append("unknown metric_key")
    if not rec.get("region") or norm_region(rec["region"]) is None:
        issues.append("unknown region")
    if rec.get("value") is None:
        issues.append("missing value")
    else:
        try:
            float(rec["value"])
        except (TypeError, ValueError):
            issues.append("non-numeric value")
    if not rec.get("unit"):
        issues.append("missing unit")
    if not rec.get("period"):
        issues.append("missing period")
    return issues


@app.get("/data/history")
def data_history():
    return store.get_imports()


@app.post("/data/rollback")
def data_rollback(payload: dict, user=Depends(require("manage_data"))):
    """Revert a single import to its pre-import state (remove only the records it
    added). Role-restricted (data_manager/admin) and audited. Original data from
    other imports is never modified."""
    ts = payload.get("ts")
    if ts is None:
        raise HTTPException(400, "ts required")
    removed = store.rollback_import(ts)
    store.audit("data_rollback", None, f"ts={ts} removed={removed}", user["username"])
    return {"ts": ts, "removed": removed, "rolled_back": removed >= 0}


# ---------------------------------------------------------------- sources
@app.get("/sources")
def sources():
    return store.get_sources()


# ---------------------------------------------------------------- reports (platform-level)
@app.get("/reports/export/{kind}")
def platform_export(kind: str, metric: str = "industry_total", unit: str = "%",
                    region: str = "Кызылординская область", lang: str = "ru", period: int = 9, req: Request = None):
    db = _db()
    cu = stats.cumulative_series(db, metric, region, unit=unit)
    label = stats.metric_label(metric, lang)
    # build proper comparison-shaped entries so the generic exporters work
    matched = [{"metric": label, "region": region, "period": p["label"], "unit": p["unit"],
                "doc_value": p["value"], "site_value": p["value"], "abs_diff": 0.0,
                "pct_diff": 0.0, "doc_source": p["source"], "site_source": p["source"]} for p in cu]
    records = [{"metric_name": label, "metric_key": metric, "region": region, "year": 2026,
                "period": p["label"], "value": p["value"], "unit": p["unit"],
                "source_sheet": p["source"], "confidence": "high"} for p in cu]
    doc_like = {"id": "platform", "filename": f"platform-{metric}", "records": records,
                "meta": {"year": 2026},
                "comparison": {"matched": matched, "discrepancies": [], "new_in_document": [], "missing_in_document": []}}
    summary = {"Report": f"{label} — {region}", "Period": f"{2026} {stats._cum_label(period, lang)}",
               "Values": str(len(cu)), "Source": "platform database"}
    stamp = time.strftime("%Y%m%d_%H%M")
    filename = f"plat_{kind}_{stamp}.pdf" if kind == "pdf" else f"plat_{kind}_{stamp}.xlsx"
    path = os.path.join(REPORTS, filename)
    period_label = f"{2026} {stats._cum_label(period, lang)}" if cu else f"{2026}"
    if kind == "pdf":
        export_pdf(doc_like, doc_like["comparison"], summary, [], path)
        resp = FileResponse(path, media_type="application/pdf", filename="QYZYLORDA_report.pdf")
    elif kind == "xlsx":
        export_xlsx(doc_like, records, doc_like["comparison"], path)
        resp = FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            filename="QYZYLORDA_report.xlsx")
    else:
        raise HTTPException(400, "kind must be pdf or xlsx")
    # Record the ACTUAL report in history (config events are NOT stored here).
    user = optional_user(req) if req is not None else None
    store.add_report_history({
        "ts": time.time(),
        "metric": metric,
        "metric_label": label,
        "region": region,
        "period": period_label,
        "period_month": period,
        "lang": lang,
        "format": kind,
        "file": filename,
        "by": (user or {}).get("username", "") or "",
    })
    return resp



@app.get("/reports/history")
def report_history():
    """Actual generated reports only (not audit/config events)."""
    return {"history": store.get_report_history()}


@app.get("/reports/file")
def report_file(file: str):
    """Serve a previously saved report file (no regeneration). Path traversal blocked."""
    safe = os.path.basename(file or "")
    path = os.path.join(REPORTS, safe)
    if not safe or not os.path.isfile(path):
        raise HTTPException(404, "file not found")
    media = "application/pdf" if safe.endswith(".pdf") else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return FileResponse(path, media_type=media, filename=safe)


# ---------------------------------------------------------------- audit
@app.get("/audit")
def audit(limit: int = 100):
    return store.get_audit(limit)
