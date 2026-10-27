# -*- coding: utf-8 -*-
"""Report Intake store — independent ri_* JSON tables.

Tables (each its own file under backend/data):
  ri_entities.json    mekeleler (entities)
  ri_reports.json     reports (with versions)
  ri_audits.json      status-change / action journal
  ri_templates.json   configurable validation templates (phase-1: general only)

Design: reuses the project's JSON-file persistence convention (no external DB).
These tables are SEPARATE from site_db.json / documents.json — they never mix.
"""
import os
import json
import threading

from backend import store as base_store  # reuse DATA dir + lock convention

_lock = threading.Lock()
DATA = base_store.DATA


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


# ---------------------------------------------------------------- entities
def get_entities():
    return _load("ri_entities.json", [])


def save_entities(items):
    _save("ri_entities.json", items)


def upsert_entity(ent):
    items = get_entities()
    for i, e in enumerate(items):
        if e["id"] == ent["id"]:
            items[i] = ent
            _save("ri_entities.json", items)
            return ent
    items.append(ent)
    _save("ri_entities.json", items)
    return ent


def get_entity(entity_id):
    for e in get_entities():
        if e["id"] == entity_id:
            return e
    return None


# ---------------------------------------------------------------- reports
def get_reports():
    return _load("ri_reports.json", [])


def save_reports(items):
    _save("ri_reports.json", items)


def upsert_report(rep):
    items = get_reports()
    for i, r in enumerate(items):
        if r["id"] == rep["id"]:
            items[i] = rep
            _save("ri_reports.json", items)
            return rep
    items.append(rep)
    _save("ri_reports.json", items)
    return rep


def get_report(report_id):
    for r in get_reports():
        if r["id"] == report_id:
            return r
    return None


def reports_for_entity(entity_id):
    return [r for r in get_reports() if r.get("entity_id") == entity_id]


# ---------------------------------------------------------------- audit
def audit(action, entity_id=None, report_id=None, user=None, detail=None):
    items = get_audits()
    from . import models
    items.append({
        "id": models.new_id("ri_aud"), "action": action, "entity_id": entity_id,
        "report_id": report_id, "user": (user or {}).get("username") if isinstance(user, dict) else user,
        "user_role": (user or {}).get("role") if isinstance(user, dict) else None,
        "detail": detail or {}, "ts": models.now(),
    })
    _save("ri_audits.json", items[-500:])


def get_audits(limit=200):
    return _load("ri_audits.json", [])[-limit:]


# ---------------------------------------------------------------- templates
def get_templates():
    return _load("ri_templates.json", [])


def save_templates(items):
    _save("ri_templates.json", items)
