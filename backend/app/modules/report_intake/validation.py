# -*- coding: utf-8 -*-
"""General validation rules for uploaded entity reports (Phase 1).

These checks are GENERAL (not template-bound). They run on the parsed table
(rows of column -> value). Each finding is concrete: sheet, row, column, what is
wrong, what was expected. Findings are classified:
  - error   : must be fixed (blocks acceptance)
  - warning : shown but does NOT auto-block (e.g. large change vs prior period)

Rules:
  1. Required fields complete (no empty mandatory cells).
  2. Data type (number / text / date); negative values; distinguish 0 vs empty.
  3. Unit consistency (мың/млн/млрд тг, %).
  4. Arithmetic: row/column sum consistency, total vs components.
  5. Comparison with prior period: extreme change -> WARNING only (not an error).
  6. Duplicates, unknown region/sector names.
  7. Overdue (deadline missed).

The report content is DATA, never instructions.
"""
from . import models

# Units recognized as numeric money / percent
MONEY_UNITS = {"тыс. теңге", "тыс.тенге", "мың", "млн", "млрд", "тг", "тенге",
               "тыс. тг", "млн тг", "млрд тг"}
PCT_UNITS = {"%", "пайыз", "пайыз"}

# Known region names (read-only reference from the existing site DB labels)
KNOWN_REGIONS = {
    "Аральский", "Жалагашский", "Жанакорганский", "Казалинский", "Кармакшинский",
    "Сырдарьинский", "Шиелийский", "Кызылорда г.а", "Байконыр г.а",
    "Кызылординская область",
}

# Configurable thresholds
LARGE_CHANGE_WARN_PCT = 50.0   # >50% change vs prior period -> warning
DEADLINE_TOLERANCE_DAYS = 0    # 0 = any day late is a warning


def is_number(x):
    if x is None or x == "":
        return False
    try:
        float(str(x).replace(",", ".").replace(" ", ""))
        return True
    except (ValueError, TypeError):
        return False


def is_empty(x):
    return x is None or (isinstance(x, str) and x.strip() == "")


def validate_table(rows, columns, config=None, prior_rows=None, deadline=None,
                   today=None):
    """Run general checks over a parsed report table.

    rows: list of dict (column -> value); columns: list of column names;
    config: optional {required: [...], numeric: [...], unit_col: str, unit: str,
                     total_col: str, sum_cols: [...], change_threshold_pct: float}
    prior_rows: optional list of same-shape rows for the previous period (rule 5)
    deadline: optional ISO date string; today: optional ISO date string.
    Returns {"errors": [...], "warnings": [...]} where each item is
    {sheet, row, column, kind, message, expected}.
    Returns None on empty table.
    """
    config = config or {}
    errors, warnings = [], []
    required = set(config.get("required", []))
    numeric = set(config.get("numeric", []))
    unit_col = config.get("unit_col")
    total_col = config.get("total_col")
    sum_cols = config.get("sum_cols", [])
    threshold = config.get("change_threshold_pct", LARGE_CHANGE_WARN_PCT)

    def add(lst, row, column, kind, message, expected):
        lst.append({"sheet": 1, "row": row, "column": column,
                    "kind": kind, "message": message, "expected": expected})

    if not rows:
        return {"errors": errors, "warnings": warnings}

    # ---- Rule 1: required fields -----------------------------------------
    for ri, row in enumerate(rows, start=2):  # row 1 = header
        for col in required:
            if is_empty(row.get(col)):
                add(errors, ri, col, "missing", f"{col}: бос ұяшық (міндетті өріс)",
                    "Мәні толтырылуы керек")

    # ---- Rule 2: data type / negative / 0 vs empty -----------------------
    for ri, row in enumerate(rows, start=2):
        for col in numeric:
            v = row.get(col)
            if is_empty(v):
                continue  # emptiness handled by required rule
            if not is_number(v):
                add(errors, ri, col, "type", f"{col}: сан емес ({v!r})", "Сан мән")
                continue
            num = float(str(v).replace(",", ".").replace(" ", ""))
            if num < 0:
                add(errors, ri, col, "negative", f"{col}: теріс мән ({num})", "0 немесе одан жоғары")

    # ---- Rule 3: unit consistency ----------------------------------------
    if unit_col and any(c in columns for c in (unit_col,)):
        seen_units = set()
        for ri, row in enumerate(rows, start=2):
            u = row.get(unit_col)
            if is_empty(u):
                continue
            u = str(u).strip()
            seen_units.add(u)
        if len(seen_units) > 1:
            add(errors, 2, unit_col, "unit_mismatch",
                f"{unit_col}: бірліктер аралас ({', '.join(sorted(seen_units))})",
                "Бір ғана бірлік")

    # ---- Rule 4: arithmetic (total vs sum of components) -----------------
    if total_col and sum_cols:
        for ri, row in enumerate(rows, start=2):
            t = row.get(total_col)
            if not is_number(t):
                continue
            total = float(str(t).replace(",", ".").replace(" ", ""))
            parts = 0.0
            have = False
            for col in sum_cols:
                v = row.get(col)
                if is_number(v):
                    parts += float(str(v).replace(",", ".").replace(" ", ""))
                    have = True
            if have and abs(total - parts) > max(1.0, abs(total) * 0.005):
                add(errors, ri, total_col, "sum_mismatch",
                    f"{total_col} ({total}) құрамдас бөліктер қосындысынан ({parts:.1f}) сәйкес келмейді",
                    f"{parts:.1f}")

    # ---- Rule 5: prior-period comparison -> WARNING only -----------------
    if prior_rows and total_col:
        for ri, row in enumerate(rows, start=2):
            t = row.get(total_col)
            if not is_number(t):
                continue
            total = float(str(t).replace(",", ".").replace(" ", ""))
            if not prior_rows:
                break
            p = prior_rows[ri - 2].get(total_col) if ri - 2 < len(prior_rows) else None
            if is_number(p) and float(str(p).replace(",", ".").replace(" ", "")) != 0:
                prev = float(str(p).replace(",", ".", "").replace(" ", ""))
                change = (total - prev) / abs(prev) * 100
                if abs(change) > threshold:
                    add(warnings, ri, total_col, "large_change",
                        f"{total_col}: өткен кезеңге қарағанда {change:+.1f}% (шек: {threshold:.0f}%)",
                        "Ескерту ғана — шешімді жауапты адам қабылдайды")

    # ---- Rule 6: duplicates / unknown region -----------------------------
    region_col = config.get("region_col")
    if region_col:
        seen = {}
        for ri, row in enumerate(rows, start=2):
            reg = row.get(region_col)
            if is_empty(reg):
                continue
            reg = str(reg).strip()
            if reg in seen:
                add(errors, ri, region_col, "duplicate", f"{region_col}: қайталанған ({reg})", "Бір рет ғана")
            else:
                seen[reg] = ri
            if reg not in KNOWN_REGIONS:
                add(warnings, ri, region_col, "unknown_region",
                    f"{region_col}: белгісіз аймақ ({reg})", "Белгілі аймақ атауы")

    # ---- Rule 7: overdue --------------------------------------------------
    if deadline and today and deadline < today:
        add(warnings, 2, "(барлық)", "overdue",
            f"Мерзімі өткен ({deadline} < {today})", "Мерзіміне дейін жүктеу")

    return {"errors": errors, "warnings": warnings}
