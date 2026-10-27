# -*- coding: utf-8 -*-
"""Shared data structures and text normalization."""
import re

REGIONS = [
    "Кызылординская область",
    "Кызылорда г.а",
    "Байконыр г.а",
    "Аральский",
    "Жалагашский",
    "Жанакорганский",
    "Казалинский",
    "Кармакшинский",
    "Сырдарьинский",
    "Шиелийский",
]

REGION_ALIASES = {
    "кызылординская область": "Кызылординская область",
    "кызылординская обл.": "Кызылординская область",
    "кызылорда г.а": "Кызылорда г.а",
    "кызылорда": "Кызылорда г.а",
    "кызылорда г.а.": "Кызылорда г.а",
    "байконыр г.а": "Байконыр г.а",
    "байконыр": "Байконыр г.а",
    "аральский": "Аральский",
    "аральский район": "Аральский",
    "жалагашский": "Жалагашский",
    "жанакоганский": "Жанакорганский",
    "жанакорганский": "Жанакорганский",
    "казалинский": "Казалинский",
    "кармакшинский": "Кармакшинский",
    "сырдарьинский": "Сырдарьинский",
    "шиелийский": "Шиелийский",
}

def norm_region(s):
    if s is None:
        return None
    t = str(s).strip().lower()
    t = t.replace("г.а", " г.а").replace("г а", " г.а")
    t = t.replace("*", "").replace("район", "").replace("обл.", " область")
    t = re.sub(r"\s+", " ", t).strip().rstrip(".").strip()
    if not t:
        return None
    if t in REGION_ALIASES:
        return REGION_ALIASES[t]
    for k, v in REGION_ALIASES.items():
        if t.startswith(k):
            return v
    return None

def to_num(v):
    """Convert cell to float or None. Returns (value, was_dash) tuple-safe: None if not numeric."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace("\u00a0", "").replace(",", ".")
    if s in ("", "-", "–", "—", "x"):
        return None
    m = re.match(r"^(-?\d+(?:\.\d+)?)$", s)
    if not m:
        return None
    return float(m.group(1))

def is_dash(v):
    if v is None:
        return False
    return str(v).strip() in ("-", "–", "—")

# Period labels: cumulative "январь-сентябрь" etc.
MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь",
          "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]

def month_number(label):
    """Return month index (1..12) for cumulative period label like 'январь-сентябрь' or single 'апрель'."""
    if not label:
        return None
    t = str(label).strip().lower()
    m = re.match(r"^январь-(\w+)$", t)
    if m:
        name = m.group(1)
        for i, mo in enumerate(MONTHS):
            if mo.startswith(name[:4]):
                return i + 1
        return None
    for i, mo in enumerate(MONTHS):
        if t == mo or t.startswith(mo):
            return i + 1
    return None

def norm_metric_name(s):
    if not s:
        return ""
    t = str(s).strip().lower()
    t = t.replace("прмышленность", "промышленность")
    t = re.sub(r"\s+", " ", t)
    return t

def metric_key_for(name):
    """Map a section/metric name to a canonical metric key.
    The kind (volume vs index) is determined by the table context, not the name,
    so both layouts map to the same keys (industry_total, mining, processing, utility, water)."""
    n = norm_metric_name(name)
    if not n:
        return None
    if ("промышленность" in n and ("всего" in n or n.startswith("промышленность"))) and "горно" not in n and "обрабат" not in n:
        return "industry_total"
    if "горнодобыва" in n:
        return "mining"
    if "обрабатыва" in n:
        return "processing"
    if "электроэнерг" in n or ("газ" in n and "пар" in n):
        return "utility"
    if "водоснабжен" in n or ("вода" in n and ("отход" in n or "ликвид" in n)):
        return "water"
    return None

def metric_display(key, kind):
    names = {
        "industry_total": "Промышленность (всего)",
        "mining": "Горнодобывающая промышленность и разработка карьеров",
        "processing": "Обрабатывающая промышленность",
        "utility": "Снабжение электроэнергией, газом, паром, горячей водой",
        "water": "Водоснабжение, водоотведение, отходы",
    }
    name = names.get(key, key)
    return ("Объем: " if kind == "vol" else "Индекс: ") + name
def _period_key(period):
    """Normalize period for comparison: 'янв-сен (суммарно)' == 'январь-сентябрь' == 'cum9'."""
    if not period:
        return None
    t = str(period).strip().lower()
    m = month_number(t.split("(")[0].strip())
    if m:
        return f"cum{m}"
    if re.fullmatch(r"[аa-я]{3,5}-[а-я]{3,5}", t):
        pass
    # 'янв-сен', 'янв-д' style abbreviations
    mm = re.match(r"^(янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)[- ](янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)", t)
    if mm:
        end = mm.group(2)
        abbr = {"янв": 1, "фев": 2, "мар": 3, "апр": 4, "май": 5, "мая": 5, "июн": 6, "июл": 7, "авг": 8, "сен": 9, "окт": 10, "ноя": 11, "дек": 12}
        if end in abbr:
            return f"cum{abbr[end]}"
    return t

def period_key(period):
    return _period_key(period)

def period_label(mk):
    if mk is None:
        return ""
    if mk.startswith("cum"):
        m = int(mk[3:])
        if m == 1:
            return "январь"
        if m == 12:
            return "декабрь"
        return f"январь-{MONTHS[m-1]}"
    return mk
