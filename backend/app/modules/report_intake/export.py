# -*- coding: utf-8 -*-
"""Simple merged Excel export + blank template for the Report Intake module.

Phase 1: a plain consolidated table (NOT the Astana/ministry format — that is
added later once the format is provided). Also provides a blank upload template.
"""
import io

try:
    import openpyxl
    from openpyxl import Workbook
except Exception:  # pragma: no cover
    openpyxl = None


def merged_xlsx(reports, lang="kk"):
    """Build a plain consolidated workbook from accepted reports.

    reports: list of report dicts (each with entity_label, period, rows, columns,
             status). One row per data row, columns: entity, period, <data cols>,
             status (мәртебе).
    Returns bytes of an .xlsx, or None if openpyxl is unavailable.
    """
    if openpyxl is None:
        return None
    wb = Workbook()
    ws = wb.active
    ws.title = "Merged"
    # collect union of columns across reports (stable order: first-seen)
    all_cols = []
    for rep in reports:
        for c in rep.get("columns", []):
            if c not in all_cols:
                all_cols.append(c)
    headers = ["entity", "period"] + all_cols + ["status"]
    ws.append(headers)
    for rep in reports:
        status = rep.get("status", "")
        for row in rep.get("rows", []):
            line = [rep.get("entity_label", ""), rep.get("period", "")]
            for c in all_cols:
                line.append(row.get(c, ""))
            line.append(status)
            ws.append(line)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def blank_template(columns, unit=None, lang="kk"):
    """A blank upload template with the expected columns as header row."""
    if openpyxl is None:
        return None
    wb = Workbook()
    ws = wb.active
    ws.title = "template"
    ws.append(list(columns))
    if unit:
        ws.append(["(example)", unit])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
