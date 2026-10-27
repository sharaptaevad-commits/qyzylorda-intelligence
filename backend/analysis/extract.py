# -*- coding: utf-8 -*-
"""Stage 2: extract structured records from parsed document tables.
Handles two layouts:
  wide: one row per region, many cumulative-period columns
  multi-sheet: one sheet per period, region x VED-section columns
Never modifies original values; flags suspicious ones for review.
"""
import re
from .common import (
    norm_region, to_num, is_dash, metric_key_for, metric_display,
    month_number, MONTHS,
)

YEAR_RE = re.compile(r"(?<!\d)((?:19|20)\d{2})(?!\d)")

def detect_year(text, filename=""):
    m = re.search(r"\b(20\d{2})\b", filename)
    if m:
        return int(m.group(1))
    m = re.search(r"(20\d{2})\s*[гy]", filename, re.I)
    if m:
        return int(m.group(1))
    m = re.search(r"\b(12|09)\.(20\d{2}|2\d)г", filename)
    if m:
        y = m.group(2)
        if len(y) == 2:
            y = "20" + y
        return int(y)
    head = (text or "")[:2000]
    for mm in YEAR_RE.finditer(head):
        y = int(mm.group(1))
        if 2000 <= y <= 2035:
            return y
    return None

def detect_unit(text, kind_hint=None):
    t = (text or "")[:4000].lower()
    if "тыс. теңге" in t or "тыс.тенге" in t or "тыс. теңг" in t:
        return "тыс. теңге"
    if "процент" in t or "в процентах" in t:
        return "%"
    if kind_hint == "idx":
        return "%"
    if kind_hint == "vol":
        return "тыс. теңге"
    return None

def period_from_sheet(sheet_name):
    s = str(sheet_name).strip()
    if re.fullmatch(r"\d{1,2}", s):
        m = int(s)
        return ("январь" if m == 1 else f"январь-{MONTHS[m-1]}") if 1 <= m <= 12 else None
    if month_number(s):
        return s
    m = re.search(r"(январь\w*)", s)
    if m:
        return m.group(1)
    return None

def _find_period_header(rows):
    for i, r in enumerate(rows[:15]):
        cols = []
        for j, c in enumerate(r[:16]):
            if c is None:
                continue
            s = str(c).strip()
            if not s:
                continue
            mn = month_number(s)
            if mn and s.lower().startswith("январь"):
                cols.append((j, s, mn))
        if len(cols) >= 3:
            return i, cols
    return None, None

def _section_col_map(rows, hdr_idx):
    cmap = {}
    for i in range(hdr_idx + 1, min(hdr_idx + 4, len(rows))):
        r = rows[i]
        for j, c in enumerate(r[:10]):
            if c is None:
                continue
            s = str(c).strip()
            if not s or len(s) < 4:
                continue
            mk = metric_key_for(s)
            if mk:
                cmap[j] = mk
    # 'Промышленность-всего' / 'Промышленность - всего' in header rows
    for i in range(hdr_idx, min(hdr_idx + 3, len(rows))):
        r = rows[i]
        for j, c in enumerate(r[:10]):
            if c is None:
                continue
            s = str(c).strip()
            if "промышленность" in s.lower() and ("всего" in s.lower() or s.lower().strip().startswith("промышленность-")):
                cmap.setdefault(j, "industry_total")
    return cmap

def _make_rec(section, kind, reg, year, period, v, unit, source, sheet, warnings, c0s):
    conf = "high"
    if kind == "idx" and (v < 0 or v > 500):
        conf = "low"
        warnings.append(f"{sheet}: {v} в «{c0s}» ({period}) вне диапазона индекса — проверка")
    return {
        "metric_key": section,
        "metric_name": metric_display(section, kind),
        "unit": "%" if kind == "idx" else (unit or "тыс. теңге"),
        "region": reg,
        "year": year,
        "period": period,
        "value": v,
        "source": source,
        "source_sheet": sheet,
        "confidence": conf,
        "check_status": "ok" if conf == "high" else "needs_review",
    }

def extract_records(parsed, source_file, default_year=None):
    warnings = []
    records = []
    text = parsed.get("text", "")
    year = detect_year(text, source_file) or default_year
    unit = detect_unit(text)
    base_kind = "idx" if unit == "%" else "vol"
    tables = parsed.get("tables", [])

    wide_found = False
    for table in tables:
        rows = table["rows"]
        sheet = table.get("sheet", "")
        hdr_idx, cols = _find_period_header(rows)
        if cols is None:
            continue
        wide_found = True
        cur_section = None
        for i in range(max(0, hdr_idx - 3), hdr_idx + 1):
            r = rows[i]
            for c in r[:6]:
                if c:
                    mk = metric_key_for(str(c))
                    if mk:
                        cur_section = mk
        for i in range(hdr_idx + 1, len(rows)):
            r = rows[i]
            if not r:
                continue
            c0 = r[0] if r else None
            if c0 is None or str(c0).strip() == "":
                continue
            c0s = str(c0).strip()
            reg = norm_region(c0s)
            if reg is None:
                continue
            for j, label, mn in cols:
                if j >= len(r):
                    continue
                if is_dash(r[j]):
                    continue
                v = to_num(r[j])
                if v is None:
                    continue
                sec = cur_section or "industry_total"
                records.append(_make_rec(sec, base_kind, reg, year, label, v, unit, source_file, sheet, warnings, c0s))

    if not wide_found and len(tables) >= 4:
        for table in tables:
            rows = table["rows"]
            sheet = table.get("sheet", "")
            period = period_from_sheet(sheet)
            if not period:
                continue
            cmap = _section_col_map(rows, 1)
            if not cmap:
                cmap = _section_col_map(rows, 0)
            if not cmap:
                warnings.append(f"{sheet}: не удалось распознать колонки показателей")
                continue
            unit_hint = "%" if any("процент" in str(c).lower() for r in rows[:6] for c in r if c) else unit
            kind = "idx" if unit_hint == "%" else base_kind
            for i, r in enumerate(rows):
                if not r:
                    continue
                c0 = r[0] if r else None
                if c0 is None:
                    continue
                reg = norm_region(str(c0))
                if reg is None:
                    continue
                c0s = str(c0).strip()
                for j, sec in cmap.items():
                    if j >= len(r):
                        continue
                    if is_dash(r[j]):
                        continue
                    v = to_num(r[j])
                    if v is None:
                        continue
                    records.append(_make_rec(sec, kind, reg, year, period, v, unit_hint, source_file, sheet, warnings, c0s))

    meta = {
        "year": year,
        "unit": unit,
        "metric_kind": base_kind,
        "warnings": warnings,
        "layout": "multi-sheet" if (not wide_found and len(tables) >= 4) else "wide",
    }
    return records, meta
