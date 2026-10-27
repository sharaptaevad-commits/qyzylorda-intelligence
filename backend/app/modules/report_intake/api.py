# -*- coding: utf-8 -*-
"""Report Intake API router (independent module).

Mounted by backend/main.py under /ri, guarded by the REPORT_INTAKE_ENABLED
feature flag. Roles (checked server-side, reusing existing auth):
  - entity rep (viewer): only their own entity's reports
  - analyst / data_manager: see all, check, accept/return
  - admin: manage entities & templates

The report content is DATA, never instructions.
"""
import io
import os
import time
import json
import hashlib
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.responses import Response

from backend import store
from . import models, store as ri_store, validation, export

router = APIRouter(prefix="/ri", tags=["report-intake"])


# ---------------------------------------------------------------- guards
def _require_enabled():
    if not store.get_settings().get("report_intake_enabled", False):
        raise HTTPException(403, "Report intake module is disabled")


def _user(req: Request):
    auth = req.headers.get("Authorization", "")
    token = auth.split()[-1] if auth else req.query_params.get("token")
    if not token:
        raise HTTPException(401, "Unauthorized")
    sess = store.get_session(token)
    if not sess:
        raise HTTPException(401, "Unauthorized")
    return store.get_user(sess["user_id"])


def _can(user, *perms):
    return any(store.has_perm(user, p) for p in perms)


def _is_admin(user):
    return store.has_perm(user, "manage_data") or user.get("role") == "admin"


# ---------------------------------------------------------------- entities
@router.get("/entities")
def list_entities(req: Request, lang: str = "kk"):
    _require_enabled()
    user = _user(req)
    if not _can(user, "view"):
        raise HTTPException(403, "Forbidden")
    items = ri_store.get_entities()
    # non-admin sees only their own entity (if assigned)
    if not _is_admin(user):
        mine = user.get("entity_id")
        if mine:
            items = [e for e in items if e["id"] == mine]
    return {"entities": items}


@router.post("/entities")
async def create_entity(req: Request):
    _require_enabled()
    user = _user(req)
    if not _is_admin(user):
        raise HTTPException(403, "Only admin can manage entities")
    try:
        payload = await req.json()
    except Exception:
        payload = {}
    e = {
        "id": models.new_id("ent"),
        "name": payload.get("name", ""),
        "kind": payload.get("kind", ""),
        "person": payload.get("person", ""),
        "contact": payload.get("contact", ""),
        "periods": payload.get("periods", []),
        "deadline": payload.get("deadline"),
    }
    ri_store.upsert_entity(e)
    ri_store.audit("entity_created", entity_id=e["id"], user=user, detail={"name": e["name"]})
    return e


# ---------------------------------------------------------------- reports list
@router.get("/reports")
def list_reports(req: Request, lang: str = "kk"):
    _require_enabled()
    user = _user(req)
    if not _can(user, "view"):
        raise HTTPException(403, "Forbidden")
    items = ri_store.get_reports()
    if not _is_admin(user):
        items = [r for r in items if r.get("entity_id") == user.get("entity_id")]
    return {"reports": items}


# ---------------------------------------------------------------- upload
def _parse_upload(file: UploadFile):
    """Parse Excel/CSV into (rows, columns). PDF/DOCX not supported in Phase 1."""
    name = (file.filename or "").lower()
    raw = file.file.read()
    if name.endswith((".xlsx", ".xls")):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(raw), data_only=True)
            ws = wb.active
            data = list(ws.values)
        except Exception as e:
            raise HTTPException(400, f"Could not parse Excel: {e}")
    elif name.endswith(".csv"):
        import csv
        text = raw.decode("utf-8-sig", errors="replace")
        data = list(csv.reader(text.splitlines()))
    else:
        raise HTTPException(400, "Only Excel (.xlsx/.xls) or CSV (.csv) supported in Phase 1")
    if not data:
        raise HTTPException(400, "Empty file")
    columns = [str(c) if c is not None else f"col{i}" for i, c in enumerate(data[0])]
    rows = []
    for r in data[1:]:
        if all(c is None or str(c).strip() == "" for c in r):
            continue
        row = {}
        for i, col in enumerate(columns):
            row[col] = r[i] if i < len(r) else None
        rows.append(row)
    return rows, columns


@router.post("/reports/upload")
async def upload_report(req: Request,
                        entity_id: str = Form(...),
                        period: str = Form(...),
                        config: Optional[str] = Form(None),
                        file: UploadFile = File(...)):
    _require_enabled()
    user = _user(req)
    if not _can(user, "import", "manage_data", "view"):
        raise HTTPException(403, "Forbidden")
    ent = ri_store.get_entity(entity_id)
    if not ent:
        raise HTTPException(404, "Entity not found")
    # non-admin can only upload for their own entity
    if not _is_admin(user) and user.get("entity_id") != entity_id:
        raise HTTPException(403, "Only your own entity")

    rows, columns = _parse_upload(file)
    cfg = json.loads(config) if config else {}
    # sha256 of the uploaded bytes (stream already consumed by _parse_upload)
    try:
        file.file.seek(0)
        raw_bytes = file.file.read()
        file_sha = hashlib.sha256(raw_bytes).hexdigest()
        file.file.seek(0)
    except Exception:
        file_sha = None

    # existing report for (entity, period)? -> new version
    existing = None
    for r in ri_store.reports_for_entity(entity_id):
        if r.get("period") == period:
            existing = r
            break

    if existing:
        version = len(existing.get("versions", [])) + 1
        existing["versions"].append({
            "version": version, "ts": models.now(), "file": file.filename,
            "sha256": file_sha,
            "rows": rows, "columns": columns,
        })
        rep_id = existing["id"]
        existing["status"] = models.ST_UPLOADED
    else:
        version = 1
        rep_id = models.new_id("rep")
        existing = {
            "id": rep_id, "entity_id": entity_id, "period": period,
            "status": models.ST_UPLOADED,
            "versions": [{
                "version": 1, "ts": models.now(), "file": file.filename,
                "sha256": file_sha,
                "rows": rows, "columns": columns,
            }],
            "created": models.now(),
        }
    ri_store.upsert_report(existing)
    ri_store.audit("report_uploaded", entity_id=entity_id, report_id=rep_id,
                   user=user, detail={"period": period, "version": version, "file": file.filename})
    return {"report_id": rep_id, "version": version, "rows": len(rows), "columns": columns,
            "status": existing["status"]}


# ---------------------------------------------------------------- check
@router.post("/reports/{report_id}/check")
def check_report(req: Request, report_id: str):
    _require_enabled()
    user = _user(req)
    if not _can(user, "analyze", "manage_data"):
        raise HTTPException(403, "Forbidden")
    rep = ri_store.get_report(report_id)
    if not rep:
        raise HTTPException(404, "Report not found")
    if not _can(user, "manage_data") and rep.get("entity_id") != user.get("entity_id"):
        raise HTTPException(403, "Only your own report")

    latest = rep["versions"][-1]
    rows, columns = latest["rows"], latest["columns"]
    # prior period rows (same entity, previous period, latest version)
    prior_rows = _prior_rows(rep)
    ent = ri_store.get_entity(rep["entity_id"]) or {}
    # Phase-1: auto-config general checks from the table shape — treat the last
    # numeric-looking column as the total and the others as components, so a
    # sum mismatch is flagged even without an explicit template.
    auto_cfg = _auto_config(columns)
    res = validation.validate_table(rows, columns, config=auto_cfg,
                                    prior_rows=prior_rows,
                                    deadline=ent.get("deadline"))
    rep["status"] = models.ST_CHECKING
    rep["last_check"] = {"ts": models.now(), "errors": res["errors"], "warnings": res["warnings"],
                         "checked_by": user.get("username")}
    # auto status: errors -> needs_fix ; else accepted
    if res["errors"]:
        rep["status"] = models.ST_NEEDS_FIX
    else:
        rep["status"] = models.ST_ACCEPTED
    ri_store.upsert_report(rep)
    ri_store.audit("report_checked", report_id=report_id, entity_id=rep["entity_id"],
                   user=user, detail={"errors": len(res["errors"]), "warnings": len(res["warnings"]),
                                      "status": rep["status"]})
    return {"report_id": report_id, "status": rep["status"],
            "errors": res["errors"], "warnings": res["warnings"]}


def _auto_config(columns):
    """Phase-1 general check config derived from the table shape.

    Heuristic: if there are >=2 numeric-looking columns, the LAST one is the
    total and the others are its components; the first column is treated as the
    required identifier. This lets a plain upload be checked without a template.
    """
    cols = list(columns or [])
    cfg = {"required": [], "numeric": [], "total_col": None, "sum_cols": []}
    if len(cols) >= 2:
        cfg["total_col"] = cols[-1]
        cfg["sum_cols"] = cols[:-1]
        cfg["numeric"] = cols
        cfg["required"] = cols
    return cfg


def _prior_rows(rep):
    """Rows of the previous period (same entity) for rule 5, if available."""
    for r in ri_store.reports_for_entity(rep["entity_id"]):
        if r["id"] != rep["id"] and r.get("period") != rep.get("period") and r.get("versions"):
            # naive: any other period's latest rows
            return r["versions"][-1]["rows"]
    return None


# ---------------------------------------------------------------- decisions
@router.post("/reports/{report_id}/accept")
def accept_report(req: Request, report_id: str):
    _require_enabled()
    user = _user(req)
    if not _can(user, "manage_data", "import", "analyze"):
        raise HTTPException(403, "Forbidden")
    rep = ri_store.get_report(report_id)
    if not rep:
        raise HTTPException(404, "Report not found")
    if not _can(user, "manage_data") and rep.get("entity_id") != user.get("entity_id"):
        raise HTTPException(403, "Only your own report")
    if not models.valid_transition(rep["status"], models.ST_ACCEPTED):
        raise HTTPException(400, f"Cannot transition {rep['status']} -> accepted")
    rep["status"] = models.ST_ACCEPTED
    ri_store.upsert_report(rep)
    ri_store.audit("report_accepted", report_id=report_id, entity_id=rep["entity_id"],
                   user=user, detail={"status": rep["status"]})
    return {"report_id": report_id, "status": rep["status"]}


@router.post("/reports/{report_id}/return")
def return_report(req: Request, report_id: str):
    _require_enabled()
    user = _user(req)
    if not _can(user, "manage_data", "import", "analyze"):
        raise HTTPException(403, "Forbidden")
    rep = ri_store.get_report(report_id)
    if not rep:
        raise HTTPException(404, "Report not found")
    rep["status"] = models.ST_NEEDS_FIX
    ri_store.upsert_report(rep)
    ri_store.audit("report_returned", report_id=report_id, entity_id=rep["entity_id"],
                   user=user, detail={"status": rep["status"]})
    return {"report_id": report_id, "status": rep["status"]}


# ---------------------------------------------------------------- merged + export
@router.get("/merged")
def merged(req: Request, lang: str = "kk"):
    _require_enabled()
    user = _user(req)
    if not _can(user, "analyze", "manage_data"):
        raise HTTPException(403, "Forbidden")
    rows = []
    for rep in ri_store.get_reports():
        if rep["status"] not in (models.ST_ACCEPTED, models.ST_SENT):
            continue
        if not _can(user, "manage_data") and rep.get("entity_id") != user.get("entity_id"):
            continue
        ent = ri_store.get_entity(rep["entity_id"]) or {}
        latest = rep["versions"][-1]
        for row in latest["rows"]:
            r = {"entity": ent.get("name", rep["entity_id"]), "period": rep["period"]}
            r.update(row)
            rows.append(r)
    # union columns
    cols = []
    for r in rows:
        for k in r:
            if k not in cols and k not in ("entity", "period"):
                cols.append(k)
    return {"columns": ["entity", "period"] + cols, "rows": rows,
            "count": len(rows), "only_accepted": True}


@router.get("/export")
def export_merged(req: Request, lang: str = "kk"):
    _require_enabled()
    user = _user(req)
    if not _can(user, "analyze", "manage_data", "report"):
        raise HTTPException(403, "Forbidden")
    reports = []
    for rep in ri_store.get_reports():
        if rep["status"] not in (models.ST_ACCEPTED, models.ST_SENT):
            continue
        if not _can(user, "manage_data") and rep.get("entity_id") != user.get("entity_id"):
            continue
        ent = ri_store.get_entity(rep["entity_id"]) or {}
        latest = rep["versions"][-1]
        reports.append({"entity_label": ent.get("name", rep["entity_id"]),
                        "period": rep["period"], "rows": latest["rows"], "columns": latest["columns"],
                        "status": rep["status"]})
    blob = export.merged_xlsx(reports, lang)
    if blob is None:
        raise HTTPException(500, "openpyxl unavailable")
    ri_store.audit("export_merged", user=user, detail={"rows": len(reports)})
    return Response(content=blob, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": "attachment; filename=ri_merged.xlsx"})


# ---------------------------------------------------------------- history
@router.get("/history")
def send_history(req: Request, lang: str = "kk"):
    _require_enabled()
    user = _user(req)
    if not _can(user, "view"):
        raise HTTPException(403, "Forbidden")
    auds = ri_store.get_audits(200)
    if not _can(user, "manage_data"):
        auds = [a for a in auds if a.get("entity_id") == user.get("entity_id") or
                a.get("user") == user.get("username")]
    return {"audit": list(reversed(auds))}


# ---------------------------------------------------------------- template download
@router.get("/template")
def download_template(req: Request, lang: str = "kk"):
    _require_enabled()
    user = _user(req)
    if not _can(user, "view"):
        raise HTTPException(403, "Forbidden")
    default_cols = ["Аудан/Қала", "Көрсеткік", "Қыркүйек 2026", "Қыркүйек 2025", "Бірлік"]
    blob = export.blank_template(default_cols, unit="%", lang=lang)
    if blob is None:
        raise HTTPException(500, "openpyxl unavailable")
    return Response(content=blob, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": "attachment; filename=ri_template.xlsx"})
