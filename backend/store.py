# -*- coding: utf-8 -*-
"""Store v2: JSON-file persistence for the full platform.
Entities: site_db (observations), documents, audit, imports, users, roles,
settings, forecast_runs, provenance/sources.

Design keeps the same JSON-file approach (no external DB dependency) so the
platform runs standalone. Each entity lives in its own file under backend/data.
"""
import os
import json
import time
import hashlib
import threading
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # project root
DATA = os.path.join(ROOT, "backend", "data")
UPLOADS = os.path.join(DATA, "uploads")
REPORTS = os.path.join(DATA, "reports")
os.makedirs(UPLOADS, exist_ok=True)
os.makedirs(REPORTS, exist_ok=True)

_lock = threading.Lock()

# ---------------------------------------------------------------- storage
def _path(name):
    return os.path.join(DATA, name)

def _load(name, default):
    p = _path(name)
    if not os.path.exists(p):
        return default
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)

def _save(name, obj):
    with _lock:
        with open(_path(name), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1, default=str)

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

# ---------------------------------------------------------------- site db
def init_site_db():
    db = _load("site_db.json", None)
    if db is None:
        seed = os.path.join(DATA, "site_db_seed.json")
        if os.path.exists(seed):
            with open(seed, "r", encoding="utf-8") as f:
                db = json.load(f)
            _save("site_db.json", db)
            print(f"[store] site_db initialized: {len(db or [])} records", flush=True)
    return db

def get_site_db():
    db = _load("site_db.json", None)
    if db is None:
        db = init_site_db() or []
    return db

def save_site_db(db):
    _save("site_db.json", db)

# ---------------------------------------------------------------- documents
def get_documents():
    return _load("documents.json", [])

def save_documents(docs):
    _save("documents.json", docs)

def get_document(doc_id):
    return next((d for d in get_documents() if d["id"] == doc_id), None)

def upsert_document(doc):
    docs = get_documents()
    for i, d in enumerate(docs):
        if d["id"] == doc["id"]:
            docs[i] = doc
            break
    else:
        docs.insert(0, doc)
    save_documents(docs)

def delete_document(doc_id):
    docs = get_documents()
    save_documents([d for d in docs if d["id"] != doc_id])

# ---------------------------------------------------------------- audit
def audit(action, doc_id=None, detail=None, user=None):
    log = _load("audit.json", [])
    log.append({"ts": time.time(), "action": action, "doc_id": doc_id,
                "detail": detail, "user": user})
    _save("audit.json", log[-1000:])

def get_audit(limit=100):
    return _load("audit.json", [])[-limit:]

# ---------------------------------------------------------------- imports
def record_import(doc_id, records, decided_by="user", note=None):
    imp = _load("imports.json", [])
    imp.append({"ts": time.time(), "doc_id": doc_id, "decided_by": decided_by,
                "note": note, "count": len(records), "records": records})
    _save("imports.json", imp[-200:])

def get_imports():
    return _load("imports.json", [])


def rollback_import(import_ts):
    """Revert a single import: remove the exact records it added from site_db.
    The original data (other imports) is never touched; only this import's rows
    (matched by (metric_key, region, period, unit, year)) are removed. Returns the
    number of records removed. Idempotent: re-rolling back removes nothing."""
    imps = _load("imports.json", [])
    target = next((i for i in imps if i.get("ts") == import_ts), None)
    if not target:
        return 0
    keys = {(r.get("metric_key"), r.get("region"), r.get("period"), r.get("unit"), r.get("year"))
            for r in target.get("records", [])}
    db = _load("site_db.json", [])
    before = len(db)
    db = [r for r in db if (r.get("metric_key"), r.get("region"), r.get("period"), r.get("unit"), r.get("year")) not in keys]
    removed = before - len(db)
    if removed:
        _save("site_db.json", db)
        # mark the import as rolled back so the UI reflects it
        target["rolled_back"] = True
        _save("imports.json", imps)
    return removed

# ---------------------------------------------------------------- users / roles
def _hash(pw):
    return hashlib.sha256(("qyzylorda::" + pw).encode("utf-8")).hexdigest()

DEFAULT_USERS = [
    {"id": "u-admin", "username": "admin", "password_hash": _hash("admin"),
     "role": "admin", "name": "Administrator", "lang": "ru", "active": True},
    {"id": "u-analyst", "username": "analyst", "password_hash": _hash("analyst"),
     "role": "analyst", "name": "Analyst", "lang": "ru", "active": True},
    {"id": "u-viewer", "username": "viewer", "password_hash": _hash("viewer"),
     "role": "viewer", "name": "Viewer", "lang": "ru", "active": True},
]

ROLE_PERMISSIONS = {
    "admin":  ["view", "analyze", "import", "manage_data", "manage_users", "forecast", "report"],
    "analyst": ["view", "analyze", "import", "forecast", "report"],
    "data_manager": ["view", "analyze", "import", "manage_data"],
    "viewer": ["view"],
}

def verify_password(pw, hashed):
    return _hash(pw) == hashed

def get_users():
    users = _load("users.json", None)
    if users is None:
        users = [dict(u) for u in DEFAULT_USERS]
        _save("users.json", users)
    return users

def save_users(users):
    _save("users.json", users)

def get_user_by_username(username):
    return next((u for u in get_users() if u["username"] == username and u.get("active", True)), None)

def get_user(user_id):
    return next((u for u in get_users() if u["id"] == user_id), None)

def permissions_for(role):
    return ROLE_PERMISSIONS.get(role, ["view"])

def has_perm(user, perm):
    if not user:
        return False
    return perm in permissions_for(user.get("role", "viewer"))

def create_session(user_id):
    sess = uuid.uuid4().hex
    sessions = _load("sessions.json", {})
    sessions[sess] = {"user_id": user_id, "created": time.time()}
    _save("sessions.json", sessions)
    return sess

def get_session(token):
    sessions = _load("sessions.json", {})
    return sessions.get(token)

def delete_session(token):
    sessions = _load("sessions.json", {})
    sessions.pop(token, None)
    _save("sessions.json", sessions)

# ---------------------------------------------------------------- settings
DEFAULT_SETTINGS = {
    "default_lang": "ru",
    "org_name": "QYZYLORDA INDUSTRIAL INTELLIGENCE",
    "region": "Кызылординская область",
    "max_upload_mb": 25,
    "match_tolerance_pct": 1.0,
    "ai_provider": "rules",   # "rules" | "external"
    "external_ai_configured": False,
    "report_intake_enabled": False,  # REPORT_INTAKE_ENABLED feature flag (default off)
    "forecast_enabled": False,  # forecasting module (default off; never on without an agreed rule)
    "forecast_report_enabled": False,  # show "Болжам есебі" report type (admin can enable)
    "alert_threshold_pp": 25.0,  # |deviation vs same period prior year| (p.p.) to flag 'needs review'
    "alert_threshold_high": 25.0,  # |deviation| p.p. threshold for HIGH severity
    "alert_threshold_medium": 15.0,  # |deviation| p.p. threshold for MEDIUM severity
}

def get_settings():
    s = _load("settings.json", None)
    if s is None:
        s = dict(DEFAULT_SETTINGS)
        _save("settings.json", s)
    else:
        merged = dict(DEFAULT_SETTINGS)
        merged.update(s)
        return merged
    return s

def save_settings(s):
    _save("settings.json", s)

# ---------------------------------------------------------------- seasonality calendar
# Manual, admin-only calendar of seasonal metrics. Shape: list of
# {id, metric, region, active_months:[1..12], nature, note, added_by, created_at}.
# The system NEVER auto-derives seasonality — this list is filled by the user.
# Empty by default (no invented values). Used only to adjust alert rules,
# comparison text and explanations — official numbers are never changed.
SEASONAL_FILE = "seasonal_calendar.json"

def get_seasonal_calendar():
    cal = _load(SEASONAL_FILE, None)
    return cal if isinstance(cal, list) else []

def save_seasonal_calendar(cal):
    if not isinstance(cal, list):
        raise ValueError("seasonal calendar must be a list")
    _save(SEASONAL_FILE, cal)

def seasonal_lookup(metric, region):
    """Return the seasonal entry for (metric, region) or None.
    A region-specific entry wins over a region=None (all-districts) entry."""
    cal = get_seasonal_calendar()
    specific = next((c for c in cal if c.get("metric") == metric and c.get("region") == region), None)
    if specific:
        return specific
    return next((c for c in cal if c.get("metric") == metric and not c.get("region")), None)

def is_seasonal_inactive(metric, region, month):
    """True if (metric, region) is configured seasonal and `month` is an inactive month."""
    entry = seasonal_lookup(metric, region)
    if not entry:
        return False
    active = entry.get("active_months") or []
    return month not in active


# ---------------------------------------------------------------- forecast runs
def record_forecast(run):
    runs = _load("forecast_runs.json", [])
    runs.append(run)
    _save("forecast_runs.json", runs[-50:])

def get_forecasts():
    return _load("forecast_runs.json", [])

def get_forecast(run_id):
    return next((r for r in get_forecasts() if r["id"] == run_id), None)

# ---------------------------------------------------------------- report history
# Records of ACTUAL reports generated (PDF/Excel). Configuration events
# (reports_config_update) are NOT stored here — they stay in the audit journal.
REPORT_HISTORY_FILE = "report_history.json"

def get_report_history():
    h = _load(REPORT_HISTORY_FILE, None)
    return h if isinstance(h, list) else []

def add_report_history(entry):
    h = get_report_history()
    h.append(entry)
    _save(REPORT_HISTORY_FILE, h[-200:])
    return entry

# ---------------------------------------------------------------- sources / provenance
def get_sources():
    return _load("sources.json", [])

def register_source(source):
    srcs = get_sources()
    for s in srcs:
        if s.get("sha256") == source.get("sha256"):
            return s
    srcs.append(source)
    _save("sources.json", srcs[-200:])
    return source
