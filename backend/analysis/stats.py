# -*- coding: utf-8 -*-
"""Statistics engine: builds time series and KPIs from the observation DB.

The source data uses year-to-date CUMULATIVE values (e.g. "январь-сентябрь").
We never treat a cumulative value as a monthly value. Where mathematically valid
(a full set of cumulative months exists for the same region/metric/unit) we derive
monthly (delta) series explicitly and label them as derived.
"""
from collections import defaultdict
from .common import month_number, period_key, MONTHS
from . import i18n

REGION_LABELS = {
    "kk": {
        "Кызылординская область": "Қызылорда облысы",
        "Кызылорда г.а": "Қызылорда қ.", "Байконыр г.а": "Байқоңыр қ.",
        "Аральский": "Арал ауданы", "Жалагашский": "Жалағаш ауданы",
        "Жанакорганский": "Жанақорған ауданы", "Казалинский": "Қазалы ауданы",
        "Кармакшинский": "Қармақшы ауданы", "Сырдарьинский": "Сырдария ауданы",
        "Шиелийский": "Шиелі ауданы",
    },
    "ru": {
        "Кызылординская область": "Кызылординская область",
        "Кызылорда г.а": "г. Кызылорда", "Байконыр г.а": "г. Байконур",
        "Аральский": "Аральский р-н", "Жалагашский": "Жалагашский р-н",
        "Жанакорганский": "Жанакорганский р-н", "Казалинский": "Казалинский р-н",
        "Кармакшинский": "Кармакшинский р-н", "Сырдарьинский": "Сырдарьинский р-н",
        "Шиелийский": "Шиелийский р-н",
    },
    "en": {
        "Кызылординская область": "Kyzylorda Region",
        "Кызылорда г.а": "Kyzylorda City", "Байконыр г.а": "Baikonur City",
        "Аральский": "Aralsky District", "Жалагашский": "Zhalagash District",
        "Жанакорганский": "Janakorgan District", "Казалинский": "Kazaly District",
        "Кармакшинский": "Karmakshi District", "Сырдарьинский": "Syrdarya District",
        "Шиелийский": "Shieli District",
    },
}

METRIC_LABELS = {
    "ru": {"industry_total": "Промышленность (всего)", "mining": "Добыча",
           "processing": "Обрабатывающая", "utility": "Э/г/пар", "water": "Вода/отходы"},
    "en": {"industry_total": "Industry (total)", "mining": "Mining",
           "processing": "Manufacturing", "utility": "Electricity/gas", "water": "Water/waste"},
    "kk": {"industry_total": "Өнеркәсіп (барлығы)", "mining": "Тау-кен",
           "processing": "Өңдеу", "utility": "Эл/газ", "water": "Су/қалдық"},
}

METRIC_KEYS = ["industry_total", "mining", "processing", "utility", "water"]

def region_label(region, lang):
    if lang in REGION_LABELS and region in REGION_LABELS[lang]:
        return REGION_LABELS[lang][region]
    return region

def metric_label(key, lang):
    return METRIC_LABELS.get(lang, METRIC_LABELS["ru"]).get(key, key)


def _index(recs):
    """group by (metric_key, region, unit) -> {period_end_month: value}"""
    g = defaultdict(dict)
    for r in recs:
        m = month_number(r["period"])
        if not m:
            continue
        g[(r["metric_key"], r["region"], r["unit"])][m] = r
    return g


def _index_by_year(recs):
    """group by (metric_key, region, unit, year) -> {period_end_month: record}.
    Year-aware so cumulative series from different years don't overwrite each other."""
    g = defaultdict(lambda: defaultdict(dict))
    for r in recs:
        m = month_number(r["period"])
        if not m:
            continue
        y = r.get("year")
        g[(r["metric_key"], r["region"], r["unit"], y)][m] = r
    return g


def _last_updated(recs):
    return max((r.get("updated") or 0 for r in recs), default=None)


def cumulative_series(recs, metric, region, unit=None, year=None, lang="ru"):
    """Return list of {month, label, value, source, year} for cumulative values.
    Year-aware: when `year` is given, only that year's periods are used.
    When `year` is None, the LATEST year (max year, then max end-month) is selected
    so that values always match the displayed period label."""
    from .common import month_number
    u = unit or _any_unit(recs, metric, region)
    gi = _index_by_year(recs)
    if year is not None:
        g = gi.get((metric, region, u, year), {})
    else:
        # Find the latest year that has data for this metric+region+unit
        years = set()
        for (m_key, reg, uu, y) in gi.keys():
            if m_key == metric and reg == region and uu == u:
                years.add(y)
        if not years:
            return []
        year = max(years)
        g = gi.get((metric, region, u, year), {})
    out = []
    for m in sorted(g):
        r = g[m]
        out.append({"month": m, "label": _cum_label(m, lang), "value": r["value"],
                    "unit": r["unit"], "source": r["source"], "year": year})
    return out


def monthly_series(recs, metric, region, unit=None):
    """Derive cumulative-delta series from cumulative values when a full run is present.
    IMPORTANT: This is NOT a 'monthly index'. It is the difference between adjacent
    cumulative values (cumulative_delta), which is a reference calculation, not an
    official metric. Returns (series, valid, note). valid=False when derivation is
    not justified (insufficient consecutive months).
    Each entry has:
      - month: month number
      - label: month name
      - cumulative_delta: the difference (cum[m] - cum[m-1]), None for month 1
      - cumulative: the cumulative value at this month
      - unit: the unit
      - derived: True if this is a computed difference (m > 1)"""
    cu = cumulative_series(recs, metric, region, unit)
    by_month = {p["month"]: p["value"] for p in cu}
    months_present = sorted(by_month)
    # need consecutive coverage from 1..max to derive deltas safely
    mx = months_present[-1] if months_present else 0
    if mx < 2 or months_present != list(range(1, mx + 1)):
        return [], False, "insufficient"
    series = []
    prev = None
    for m in range(1, mx + 1):
        cum = by_month[m]
        delta = None if prev is None else round(cum - prev, 1)  # cumulative_delta, 1 decimal
        series.append({"month": m, "label": MONTHS[m - 1],
                       "cumulative_delta": delta,  # NOT a monthly index
                       "value": delta,  # backward compatibility (forecast.py expects 'value')
                       "cumulative": cum, "unit": cu[-1]["unit"],
                       "derived": m > 1})
        prev = cum
    return series, True, "derived_from_cumulative"


def _any_unit(recs, metric, region):
    for r in recs:
        if r["metric_key"] == metric and r["region"] == region:
            return r["unit"]
    return None


def _cum_label(m):
    if m == 1:
        return "январь"
    if m == 12:
        return "декабрь"
    return f"январь-{MONTHS[m - 1]}"


# ---------------------------------------------------------------- index dynamics (cumulative) vs volume (monthly)
# RULES (data integrity):
#  - CUMULATIVE INDEXES must NEVER be differenced into a "monthly index".
#    We only plot the cumulative index line (per selected year + compare year).
#  - CUMULATIVE VOLUMES may be differenced into a monthly volume, but only when
#    BOTH adjacent cumulative periods exist. A missing period -> null (never 0).
#  - If a cumulative volume decreases going back (correction/review), flag it
#    for review instead of hiding it.

def index_dynamics(recs, metric, region, year, unit="%", compare_year=None, lang="ru"):
    """Cumulative index dynamics: one point per month for the selected `year`,
    plus the same months for `compare_year` (compatible periods). Never derives
    a monthly index. Months without data in `year` have value=None (line breaks).
    `label` is localized to `lang`; `label_short` is a compact month name for the
    X axis. Values are returned as-is (the frontend rounds to 1 decimal for display)."""
    from .i18n import STRINGS
    tr = STRINGS.get(lang, STRINGS["ru"])
    def _ml(m):
        return tr.get(f"month_{m}", MONTHS[m - 1])
    gi = _index_by_year(recs)
    cur = gi.get((metric, region, unit, year), {})
    cmp_by = gi.get((metric, region, unit, compare_year), {}) if compare_year else {}
    months = sorted(cur.keys())
    max_month = months[-1] if months else 0
    series = []
    for m in range(1, max_month + 1):
        r = cur.get(m)
        val = r["value"] if r else None
        c = cmp_by.get(m)
        cmp_val = c["value"] if c else None
        delta = round(val - cmp_val, 1) if (val is not None and cmp_val is not None) else None
        series.append({"month": m, "label": _ml(m), "label_short": _ml(m)[:4],
                       "value": val, "compare": cmp_val, "delta": delta,
                       "source": (r.get("source") if r else None)})
    return {"months": list(range(1, max_month + 1)), "max_month": max_month,
            "year": year, "compare_year": compare_year if compare_year else None,
            "series": series}


def volume_monthly(recs, metric, region, year, unit="тыс. теңге", compare_year=None, lang="ru"):
    """Monthly VOLUME derived by differencing adjacent CUMULATIVE volumes.
    Valid ONLY for volume (not index). A month is null unless BOTH the
    cumulative value for that month AND the previous month exist in `year`.
    January is the first cumulative value itself. A negative delta (cumulative
    decreased -> correction/review) is flagged needs_review, never hidden.
    compare_year provides the same months for a grey comparison bar.
    Labels are localized to `lang`."""
    from .i18n import STRINGS
    tr = STRINGS.get(lang, STRINGS["ru"])
    def _ml(m):
        return tr.get(f"month_{m}", MONTHS[m - 1])
    gi = _index_by_year(recs)
    cur = gi.get((metric, region, unit, year), {})
    cmp_by = gi.get((metric, region, unit, compare_year), {}) if compare_year else {}
    months = sorted(cur.keys())
    max_month = months[-1] if months else 0

    def _derive(by_month):
        out = []
        prev_cum = None
        prev_m = None
        for m in range(1, max_month + 1):
            r = by_month.get(m)
            cum = r["value"] if r else None
            # monthly volume = cumulative(m) - cumulative(m-1), requires BOTH
            # the current month AND the immediately previous month to be present.
            if cum is None:
                mv = None
            elif m == 1:
                mv = cum  # January = its own cumulative (delta from 0)
            elif prev_m == m - 1 and prev_cum is not None:
                mv = round(cum - prev_cum, 3)
            else:
                mv = None  # gap: previous cumulative month missing
            out.append(mv)
            if cum is not None:
                prev_cum = cum
                prev_m = m
        return out

    cur_derived = _derive(cur)
    cmp_derived = _derive(cmp_by) if compare_year else [None] * max_month
    series = []
    for i in range(max_month):
        m = i + 1
        mv = cur_derived[i]
        cum = (cur.get(m) or {}).get("value")
        series.append({"month": m, "label": _ml(m), "label_short": _ml(m)[:4], "value": mv, "cumulative": cum,
                       "needs_review": (mv is not None and mv < 0),
                       "compare": cmp_derived[i] if i < len(cmp_derived) else None})
    return {"max_month": max_month, "year": year, "compare_year": compare_year,
            "series": series}


def _value_at(recs, metric, region, month, unit=None):
    for r in recs:
        if r["metric_key"] == metric and r["region"] == region and month_number(r["period"]) == month:
            if unit is None or r["unit"] == unit:
                return r
    return None


def yoy_compare(all_recs, metric, region, month, unit, kind, lang="ru"):
    """Compare the current year's cumulative figure for `month` against the same
    cumulative period of a prior year (year-1, else the most recent earlier year
    that has data). Returns a dict the frontend can render without inventing
    anything:
      - value/prev_value: current and prior cumulative values
      - change: percentage-point diff for index (%), absolute diff for volume
      - change_pct: relative change (volume); for index this equals change (п.п.)
      - prior_year: the year actually compared (or None)
      - reason: when no comparable prior year exists, a precise i18n reason key
    Distinguishes a legitimate 0 from a missing value (None)."""
    cur = _value_at(all_recs, metric, region, month, unit=unit)
    if cur is None or cur.get("value") is None:
        return {"value": None, "prev_value": None, "change": None, "change_pct": None,
                "prior_year": None, "reason": "no_current"}
    cur_year = cur.get("year")
    if cur_year is None:
        return {"value": cur["value"], "prev_value": None, "change": None, "change_pct": None,
                "prior_year": None, "reason": "no_year"}
    # find prior year with the same cumulative period
    prior = None
    for y in range(cur_year - 1, cur_year - 4, -1):
        yr_recs = [r for r in all_recs if r.get("year") == y]
        rec = _value_at(yr_recs, metric, region, month, unit=unit)
        if rec is not None and rec.get("value") is not None:
            prior = (y, rec)
            break
    if prior is None:
        return {"value": cur["value"], "prev_value": None, "change": None, "change_pct": None,
                "prior_year": None, "reason": "no_prior", "cur_year": cur_year, "month": month}
    py, precp = prior
    base = precp["value"]
    val = cur["value"]
    if kind == "idx":
        # index: percentage-point difference
        change = round(val - base, 1)
        change_pct = change  # same magnitude, labelled п.п.
    else:
        # volume: absolute + relative; base of 0 -> no relative change
        abs_diff = round(val - base, 0)
        rel = None if base in (0, None) else round((val - base) / base * 100, 1)
        change = abs_diff
        change_pct = rel
    return {"value": val, "prev_value": base, "change": change, "change_pct": change_pct,
            "prior_year": py, "reason": None}


def kpis(recs, lang="ru"):
    """Build dashboard KPI cards. None where data is unavailable (never 0)."""
    reg = "Кызылординская область"
    ind = _value_at(recs, "industry_total", reg, 9, unit="%")
    ind_vol = _value_at(recs, "industry_total", reg, 9, unit="тыс. теңге")
    mfg = _value_at(recs, "processing", reg, 9, unit="%")
    mfg_vol = _value_at(recs, "processing", reg, 9, unit="тыс. теңге")
    # districts with data
    districts = {r["region"] for r in recs if r["region"] != reg}

    def card(name, rec, cmp_rec=None, kind="abs"):
        val = rec["value"] if rec else None
        chg = None
        if rec and cmp_rec and kind == "abs" and cmp_rec.get("value") not in (0, None):
            base = cmp_rec["value"]
            chg = (val - base) / base * 100
        return {"key": name, "value": val, "unit": rec["unit"] if rec else None,
                "change_pct": chg, "source": rec["source"] if rec else None}

    return {
        "last_update": _last_updated(recs),
        "kpi_volume": card("volume", ind_vol),
        "kpi_index": card("index", ind),
        "kpi_mfg_output": card("mfg_output", mfg_vol),
        "kpi_mfg_index": card("mfg_index", mfg),
        "kpi_yoy": {"value": None, "note": "prev-year series not in DB"},
        "kpi_mom": None,
        "kpi_districts": {"value": len(districts), "unit": None},
        "kpi_forecast": {"value": None, "note": "open Forecasting to compute"},
    }


def district_table(recs, metric, month=9, unit="%", lang="ru"):
    """Ranked table of districts for a metric/month.
    Deduplicates on (region, period): when the same region+period appears from
    more than one source, keep the record from the most recent source (the one
    that was imported last) so the oblast/district is never listed twice."""
    rows = []
    for r in recs:
        if r["metric_key"] != metric or month_number(r["period"]) != month:
            continue
        if unit and r["unit"] != unit:
            continue
        rows.append({
            "region": r["region"], "label": region_label(r["region"], lang),
            "value": r["value"], "unit": r["unit"], "source": r["source"],
        })
    # dedupe on region: prefer the record whose source name sorts last (most recent
    # file) — stable, deterministic. Keeps a single row per region.
    best = {}
    for x in rows:
        cur = best.get(x["region"])
        if cur is None or (x["source"] or "") >= (cur["source"] or ""):
            best[x["region"]] = x
    rows = list(best.values())
    rows.sort(key=lambda x: (x["value"] is None, -(x["value"] or 0)))
    return rows


def industry_structure(recs, month=9, lang="ru"):
    """Share of each industry in total (volume)."""
    reg = "Кызылординская область"
    parts = []
    total = 0
    for mk in ["mining", "processing", "utility", "water"]:
        r = _value_at(recs, mk, reg, month, unit="тыс. теңге")
        if r:
            parts.append({"key": mk, "label": metric_label(mk, lang), "value": r["value"]})
            total += r["value"]
    for p in parts:
        p["share"] = round(p["value"] / total * 100, 1) if total else None
    return parts


# ---------------------------------------------------------------- period-aware district helpers
OBLAST = "Кызылординская область"

# canonical district ids (source region string -> canonical id)
DISTRICT_IDS = {
    "Аральский": "aral", "Жалагашский": "zhalagash", "Жанакорганский": "zhanakorgan",
    "Казалинский": "kazaly", "Кармакшинский": "kar-maksha", "Сырдарьинский": "syrdarya",
    "Шиелийский": "shieli", "Кызылорда г.а": "kyzylorda_city", "Байконыр г.а": "baikonur_city",
}

def canonical_district_id(region):
    """Map a source region string to its canonical id, or None for the oblast / unknown."""
    if region == OBLAST:
        return None
    return DISTRICT_IDS.get(region)

def available_periods(recs, metric, unit):
    """Distinct (year, period) pairs that actually have data for metric+unit,
    sorted chronologically (year asc, period end-month asc)."""
    seen = set()
    out = []
    for r in recs:
        if r["metric_key"] != metric:
            continue
        if unit and r["unit"] != unit:
            continue
        key = (r.get("year"), r["period"])
        if key in seen:
            continue
        seen.add(key)
        out.append((r.get("year") or 0, r["period"]))
    out.sort(key=lambda x: (x[0], month_number(x[1]) or 0, x[1]))
    return [p for _, p in out]


def _dedupe_period(recs, metric, period, unit, year=None):
    """For one exact (period[, year]) keep a single record per district:
    prefer the record whose source name sorts last (most recently imported file),
    so the oblast/district is never listed twice. Returns {district_id_or_region: record}."""
    best = {}
    for r in recs:
        if r["metric_key"] != metric:
            continue
        if r["period"] != period:
            continue
        if unit and r["unit"] != unit:
            continue
        if year is not None and r.get("year") != year:
            continue
        did = canonical_district_id(r["region"]) or r["region"]  # oblast/unknown kept by name
        cur = best.get(did)
        if cur is None or (r["source"] or "") >= (cur["source"] or ""):
            best[did] = r
    return best


def district_compare(recs, metric, unit, period, year, compare_year=None, compare_period=None, lang="ru"):
    """One-period district table with optional prior-year (compatible) comparison.
    `compare_period` is the exact prior-year period to compare against. Delta is
    computed ONLY when `period` and `compare_period` end in the same month
    (compatible cumulative windows, e.g. Jan–Sep ↔ Jan–Sep). When they differ, the
    comparison value is still shown (informational) but delta is None with a
    `period_mismatch` flag. Status is synced with the Alerts page: a deviation vs
    the prior year beyond `alert_threshold_pp` p.p. flags the row 'review'.
    Returns: { period, year, compare_year, compare_period, unit, metric,
      period_label, compare_period_label, period_mismatch, oblast, rows: [ {id,label,region,value,compare,delta,delta_pct,status,source,source_full,compare_source} ] }"""
    from .common import month_number
    from .i18n import STRINGS
    from .. import store as _store
    tr = STRINGS.get(lang, STRINGS["ru"])
    cp = compare_period or period  # default: same period string in prior year
    pm = month_number(period)
    cp_month = month_number(cp)
    compatible = (cp_month is not None and cp_month == pm)
    base = _dedupe_period(recs, metric, period, unit, year)
    comp = _dedupe_period(recs, metric, cp, unit, compare_year) if compare_year else {}
    threshold_pp = float(_store.get_settings().get("alert_threshold_pp", 25.0))

    def _label(m):
        if m is None:
            return period if m is None else m
        if m == 12:
            # Annual window (jan–dec): full-year label, not a single month.
            return tr.get("cumulative_jan_to", "янв–{m}").format(m=tr.get("month_12", "декабрь"))
        return _cum_local(m, lang)
    period_label = _label(pm)
    compare_period_label = _label(cp_month)

    rows = []
    for did, r in base.items():
        if r["region"] == OBLAST:
            continue
        val = r["value"]
        c = comp.get(did)
        cmp_val = c["value"] if c and c["value"] is not None else None
        cmp_src = (c["source"] if c else None)
        delta = None
        delta_pct = None
        # Delta only when periods are compatible (same end month) AND both values present.
        if val is not None and cmp_val is not None and compatible:
            if unit == "%":
                delta = round(val - cmp_val, 1)
            else:
                delta = round(val - cmp_val, 3)
                if cmp_val not in (0, None):
                    delta_pct = round((val - cmp_val) / cmp_val * 100, 1)
        # Status synced with Alerts: deviation vs prior year beyond threshold_pp -> review.
        if val is None:
            status = "no_data"
        elif cmp_val is not None and compatible:
            dev = (val - cmp_val) if unit == "%" else None
            status = "review" if (dev is not None and abs(dev) > threshold_pp) else "verified"
        else:
            status = "unverified"
        rows.append({
            "id": did, "label": region_label(r["region"], lang), "region": r["region"],
            "value": val, "compare": cmp_val, "delta": delta, "delta_pct": delta_pct,
            "status": status, "source": short_source(r["source"]), "source_full": r["source"],
            "compare_source": short_source(cmp_src) if cmp_src else None,
        })
    rows.sort(key=lambda x: (x["value"] is None, -(x["value"] or 0)))
    ob = base.get(OBLAST) or base.get(canonical_district_id(OBLAST))
    oblast = None
    if ob and ob["value"] is not None:
        ob_cmp = comp.get(OBLAST) or comp.get(canonical_district_id(OBLAST))
        cval = ob_cmp["value"] if ob_cmp else None
        delta = round(ob["value"] - cval, 1) if (cval is not None and unit == "%" and compatible) else None
        oblast = {"value": ob["value"], "compare": cval, "delta": delta,
                  "source": short_source(ob["source"]), "source_full": ob["source"],
                  "compare_source": short_source(ob_cmp["source"]) if ob_cmp else None}
    return {"period": period, "year": year, "compare_year": compare_year if compare_year else None,
            "compare_period": cp, "unit": unit, "metric": metric,
            "period_label": period_label, "compare_period_label": compare_period_label,
            "period_mismatch": (not compatible),
            "oblast": oblast, "rows": rows}


def short_source(name):
    """Short human label for a source file name."""
    n = (name or "").replace(".xlsx", "")
    if n.startswith("OKED"):
        return n[:16]
    if "Т-04-01-М" in n or "T-04-01-M" in n.upper():
        return "Т-04-01-М" + (" 09/2026" if "09_2026" in n or "09_2026" in n else "")
    if "Индексы" in n:
        return "ВЭД индексі" + (" 09/2026" if "09.2026" in n else "")
    if "Объем" in n or "объём" in n.lower():
        return "ВЭД көлемі" + (" 09/2026" if "09.2026" in n else "")
    return n[:24]


# ---------------------------------------------------------------- v2 helpers
def format_volume(value, unit, lang="ru"):
    """Format a volume value with the correct, honest unit.
    Source unit 'тыс. теңге' -> display in млрд тг (value / 1e6) or тыс. тг.
    Never fabricate; returns (display, unit_label)."""
    from .i18n import STRINGS
    tr = STRINGS.get(lang, STRINGS["ru"])
    if value is None:
        return None, None
    if unit == "%":
        return round(value, 1), tr.get("unit_pct", "%")
    # thousands of tenge
    if unit in ("тыс. теңге", "тыс.тенге", "тыс. теңг"):
        v = float(value)
        if abs(v) >= 1e6:  # >= 1 млрд
            return round(v / 1e6, 1), tr.get("unit_blrtenge", "млрд тг")
        if abs(v) >= 1e3:
            return round(v / 1e3, 1), tr.get("unit_ktenge", "тыс. тг")
        return round(v, 1), tr.get("unit_ktenge", "тыс. тг")
    return value, unit


def anomaly_flags(district_rows, threshold=2.0):
    """Flag index values that deviate > threshold* from the median across
    districts (a possible small-base artefact). Honest heuristic; the value is
    never hidden — only flagged for review."""
    vals = [r["value"] for r in district_rows if r.get("value") is not None]
    if len(vals) < 4:
        return set()
    s = sorted(vals)
    n = len(s)
    median = s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2
    if not median:
        return set()
    flagged = set()
    for r in district_rows:
        v = r.get("value")
        if v is None:
            continue
        if abs(v) >= threshold * max(abs(median), 1) or v < 0.5 * median:
            flagged.add(r["region"])
    return flagged


def build_alerts(recs, lang="ru"):
    """Early signals: anomalous district values + coverage/quality summary."""
    from .i18n import STRINGS
    tr = STRINGS.get(lang, STRINGS["ru"])
    districts = district_table(recs, "industry_total", month=9, unit="%", lang=lang)
    flagged_regions = anomaly_flags(districts)
    anomalies = []
    for r in districts:
        if r["region"] in flagged_regions and r["region"] != "Кызылординская область":
            anomalies.append({
                "region": r["region"], "label": r["label"], "value": r["value"],
                "note": tr.get("alerts_anomaly_note"), "severity": "warn",
            })
    # coverage: which metric/region combos are missing
    covered = {(r["metric_key"], r["region"]) for r in recs}
    all_metrics = ["industry_total", "mining", "processing", "utility", "water"]
    regions = sorted({r["region"] for r in recs if r["region"] != "Кызылординская область"})
    missing_count = sum(1 for m in all_metrics for rg in regions if (m, rg) not in covered)
    districts_with_data = len({r["region"] for r in recs if r["region"] != "Кызылординская область"})
    return {
        "anomalies": anomalies,
        "districts_with_data": districts_with_data,
        "missing_combinations": missing_count,
        "alerts_none": tr.get("alerts_none"),
    }


def build_summary(recs, lang="ru"):
    """Executive summary as 3-4 short fact lines, built only from real DB values.
    Each line carries its own evidence (metric, value, period). YoY deltas come
    from the same cumulative period of a prior year; when unavailable the line
    simply omits the delta (nothing invented)."""
    from .i18n import STRINGS
    tr = STRINGS.get(lang, STRINGS["ru"])
    reg = "Кызылординская область"
    all_recs = recs  # caller passes current-year recs; yoy_compare needs all years
    ind = _value_at(recs, "industry_total", reg, 9, unit="%")
    mfg = _value_at(recs, "processing", reg, 9, unit="%")
    vol = _value_at(recs, "industry_total", reg, 9, unit="тыс. теңге")
    # YoY for index (percentage points) — needs all years; pass full DB via a marker
    # (yoy_compare filters by year internally when given all recs)
    lines = []
    def yoy(metric, unit, kind):
        # all_recs may be current-year only; if so prior year is absent -> reason no_prior
        return yoy_compare(all_recs, metric, reg, 9, unit, kind, lang=lang)
    if ind:
        y = yoy("industry_total", "%", "idx")
        s = f"{ind['value']:.1f}%"
        if y.get("change") is not None:
            s += f" ({_signed(y['change'], lang)} п.п. {tr.get('vs_prior', '')} {y.get('prior_year')})"
        lines.append({"key": "index", "text": f"{tr.get('sum_index_label')}: {s}",
                      "metric": "industry_total", "value": ind["value"],
                      "period": _cum_label(9, lang), "source": ind.get("source")})
    if vol:
        dv, du = format_volume(vol["value"], vol["unit"], lang)
        lines.append({"key": "volume", "text": f"{tr.get('sum_volume_label')}: {dv} {du}",
                      "metric": "industry_total", "value": vol["value"], "unit": du,
                      "period": _cum_label(9, lang), "source": vol.get("source")})
    if mfg:
        y = yoy("processing", "%", "idx")
        s = f"{mfg['value']:.1f}%"
        if y.get("change") is not None:
            s += f" ({_signed(y['change'], lang)} п.п.)"
        lines.append({"key": "mfg", "text": f"{tr.get('sum_mfg_label')}: {s}",
                      "metric": "processing", "value": mfg["value"],
                      "period": _cum_label(9, lang), "source": mfg.get("source")})
    # Seasonality note: if any tracked metric is configured seasonal for this
    # period, append a neutral 'seasonal change' explanation (not a decline).
    from .. import store as _store
    if _store.seasonal_lookup("industry_total", reg) or any(
        _store.seasonal_lookup(m, reg) for m in METRIC_KEYS
    ):
        lines.append({"key": "seasonal",
                      "text": tr.get("badge_seasonal_tip"),
                      "seasonal": True,
                      "period": _cum_label(9, lang)})
    return lines


def _signed(v, lang="ru"):
    if v is None:
        return ""
    return ("+" if v >= 0 else "−") + f"{abs(v):.1f}"


def _cum_label(month, lang="ru"):
    from .i18n import STRINGS
    tr = STRINGS.get(lang, STRINGS["ru"])
    if month == 1:
        return tr.get("month_1", "январь")
    return tr.get("cumulative_jan_to", "янв–{m}").format(m=tr.get(f"month_{month}", month))


def month_name(month, lang="ru"):
    from .i18n import STRINGS
    tr = STRINGS.get(lang, STRINGS["ru"])
    return tr.get(f"month_{month}", "")


# ---------------------------------------------------------------- industry sectors (v2)
SECTORS = ["mining", "processing", "utility", "water"]


def industry_sectors(recs, region, lang="ru"):
    """For the 4 sectors + 'total', return cumulative + derived monthly series
    (both index % and volume тыс.теңге), built only from available data.
    A sector's monthly series is marked invalid when not enough cumulative
    months exist — the UI then shows the single value + explanation."""
    from .i18n import STRINGS
    tr = STRINGS.get(lang, STRINGS["ru"])
    out = []
    for mk in SECTORS + ["industry_total"]:
        entry = {"key": mk, "label": metric_label(mk, lang), "short": (
            tr.get(f"sector_{mk}_short") or metric_label(mk, lang))}
        for unit in ("%", "тыс. теңге"):
            cu = cumulative_series(recs, mk, region, unit=unit)
            mo, valid, note = monthly_series(recs, mk, region, unit=unit)
            # localized month labels
            for p in mo:
                p["label"] = month_name(p["month"], lang)
            for p in cu:
                p["label"] = _cum_local(p["month"], lang)
            last = cu[-1] if cu else None
            if unit == "%":
                entry["index"] = {
                    "available": bool(cu), "monthly_valid": valid,
                    "cumulative": cu, "monthly": mo, "note": note,
                    "last": last["value"] if last else None,
                    "last_period": _cum_local(cu[-1]["month"], lang) if cu else None,
                }
            else:
                entry["volume"] = {
                    "available": bool(cu), "monthly_valid": valid,
                    "cumulative": cu, "monthly": mo, "note": note,
                    "last_raw": last["value"] if last else None,
                    "last": format_volume(last["value"], last["unit"], lang)[0] if last else None,
                    "last_unit": format_volume(last["value"], last["unit"], lang)[1] if last else None,
                    "last_period": _cum_local(cu[-1]["month"], lang) if cu else None,
                }
        out.append(entry)
    return out


def _cum_local(m, lang="ru"):
    from .i18n import STRINGS
    tr = STRINGS.get(lang, STRINGS["ru"])
    if m == 1:
        return tr.get("month_1", "январь")
    if m == 12:
        return tr.get("month_12", "декабрь")
    return tr.get("cumulative_jan_to", "янв–{m}").format(m=tr.get(f"month_{m}", m))


# ---------------------------------------------------------------- alerts (detailed) — additive
def available_periods_sorted(recs, metric):
    """Distinct cumulative end-months present for a metric (all regions/years)."""
    months = set()
    for r in recs:
        if r["metric_key"] == metric:
            m = month_number(r["period"])
            if m:
                months.add(m)
    return sorted(months)


def build_alerts_detailed(recs, lang="ru", period_month=9, threshold=25.0, threshold_medium=15.0, threshold_pp=25.0):
    """Detailed, period-scoped alerts.

    - threshold_pp (default 25 p.p.): the primary rule. A row is flagged
      'needs_review' when its value deviates from the same cumulative period of
      the PRIOR YEAR by more than ±threshold_pp percentage points. This is an
      attention marker, not an error, and the threshold is admin-configurable.
    - threshold / threshold_medium: secondary |deviation| cut-offs for HIGH /
      MEDIUM severity (configurable via settings).
    """
    from .i18n import STRINGS
    tr = STRINGS.get(lang, STRINGS["ru"])
    from .. import store as _store
    OBLAST = "Кызылординская область"
    metrics = ["industry_total", "mining", "processing", "utility", "water"]

    # ---- anomalies for the selected period --------------------------------
    anomalies = []
    for metric in metrics:
        rows = district_table(recs, metric, month=period_month, unit=None, lang=lang)
        med_flags = anomaly_flags(district_table(recs, metric, month=period_month, unit=None, lang=lang))
        for r in rows:
            if r["region"] == OBLAST:
                continue
            if r.get("value") is None:
                continue
            base = _yoy_base(recs, metric, r["region"], period_month, lang)
            dev = None
            if base is not None and r["value"] is not None:
                dev = round(r["value"] - base, 1)
            sev = "low"
            if dev is not None:
                # primary rule: deviation beyond ±threshold_pp p.p. -> needs review
                if abs(dev) > threshold_pp:
                    sev = "high" if abs(dev) >= threshold else "medium"
                elif abs(dev) >= threshold_medium:
                    sev = "medium"
            if sev == "low" and r["region"] in med_flags:
                sev = "medium"  # small-base heuristic, no computable deviation
            # Seasonality override (alert rule only — official value untouched):
            #  - inactive month + configured seasonal -> neutral 'seasonal' (expected)
            #  - active month + still anomalous -> escalate to 'high'
            seasonal_configured = _store.seasonal_lookup(metric, r["region"]) is not None
            seasonal_inactive = _store.is_seasonal_inactive(metric, r["region"], period_month)
            reason = tr.get("al_needs_fix_reason")
            if seasonal_inactive and sev in ("low", "medium", "high"):
                sev = "seasonal"
                reason = tr.get("badge_seasonal_tip", reason)
            elif seasonal_configured and not seasonal_inactive and sev in ("medium", "high"):
                sev = "high" if abs(dev or 0) >= threshold else "medium"
            anomalies.append({
                "metric": metric, "metric_label": metric_label(metric, lang),
                "region": r["region"], "label": r["label"],
                "period_month": period_month,
                "period": _cum_local(period_month, lang),
                "value": r["value"],
                "base": base,
                "base_label": (f"{period_month} {tr.get('vs_prior_year','')}") if base is not None else None,
                "deviation": dev, "severity": sev,
                # Percentage change: (value - base)/|base| * 100. None if base is
                # 0/missing (cannot divide) — UI shows "calculation impossible".
                "pct_change": (round((r["value"] - base) / abs(base) * 100, 1)
                               if (base not in (0, None) and r["value"] is not None) else None),
                "seasonal": seasonal_configured, "seasonal_inactive": seasonal_inactive,
                "source": r.get("source"), "period_source": r.get("period"),
                "status": "needs_review",
                "reason": reason,
            })

    # ---- missing / stale --------------------------------------------------
    missing = []
    regions = sorted({r["region"] for r in recs if r["region"] != OBLAST})
    for metric in metrics:
        have = {(r["region"]) for r in recs if r["metric_key"] == metric and month_number(r["period"]) == period_month and r["region"] != OBLAST}
        for rg in regions:
            if rg not in have:
                # Seasonal break: if (metric, region) is configured seasonal and this
                # period is an INACTIVE month, a missing value is EXPECTED — do not
                # count it as missing/stale (display note only).
                seasonal_break = _store.is_seasonal_inactive(metric, rg, period_month)
                if seasonal_break:
                    continue
                # last period that exists for (metric, region)
                lastm = None
                for r in recs:
                    if r["metric_key"] == metric and r["region"] == rg:
                        m = month_number(r["period"])
                        if m and (lastm is None or m > lastm):
                            lastm = m
                what = "absent"
                if lastm is not None and lastm < period_month:
                    what = "stale"
                missing.append({
                    "metric": metric, "metric_label": metric_label(metric, lang),
                    "region": rg, "label": region_label(rg, lang),
                    "what": what, "last_month": lastm,
                    "last_period": _cum_local(lastm, lang) if lastm else None,
                    "due_period": _cum_local(period_month, lang),
                })

    # ---- summary counters (same semantics as build_alerts, for the card) --
    districts_with_data = len({r["region"] for r in recs if r["region"] != OBLAST})
    return {
        "period_month": period_month,
        "period": _cum_local(period_month, lang),
        "threshold": threshold,
        "metrics_checked": len(metrics),
        "anomalies": anomalies,
        "missing": missing,
        "districts_with_data": districts_with_data,
        "districts_total": len(regions),
    }


def _yoy_base(recs, metric, region, month, lang):
    """Value of the same cumulative period in the prior year (None if absent)."""
    for r in recs:
        if r["metric_key"] == metric and r["region"] == region and month_number(r["period"]) == month:
            if (r.get("year") or 0) < 2026:
                return r["value"]
    return None
