# -*- coding: utf-8 -*-
"""Rule-based AI analytics layer (no external API dependency).
Every statement is built only from extracted/compared data and cites sources.
"""
import re
from .common import norm_region

LANGS = ["kz", "ru", "en"]

def _fmt(v, unit=""):
    if v is None:
        return "—"
    if abs(v) >= 1000000:
        s = f"{v:,.0f}"
    elif abs(v) >= 1000:
        s = f"{v:,.1f}"
    else:
        s = f"{v:,.2f}".rstrip("0").rstrip(".")
    return f"{s} {unit}".strip()

def _pct(p):
    if p is None:
        return "—"
    return f"{p:+.1f}%"

def _comp(comp):
    comp = comp or {}
    return {
        "matched": comp.get("matched", []),
        "discrepancies": comp.get("discrepancies", []),
        "new_in_document": comp.get("new_in_document", []),
        "missing_in_document": comp.get("missing_in_document", []),
    }

def build_summary(doc, meta, comp, lang="ru"):
    """Return dict with summary fields (localized)."""
    comp = _comp(comp)
    n_total = sum(len(v) for v in comp.values())
    matched = comp["matched"]
    disc = comp["discrepancies"]
    new = comp["new_in_document"]

    src = doc.get("filename", "")
    year = meta.get("year") or "—"

    if lang == "en":
        base = {
            "doc": f"Document «{src}» (report year {year}) contains {len(doc.get('records', []))} extracted values.",
            "match": f"{len(matched)} values match the site database (within 1%).",
            "diff": f"{len(disc)} discrepancies require attention.",
            "new": f"{len(new)} values are not present in the site database and can be imported after verification.",
            "caveat": "All figures come directly from the document and site database; no values were estimated or invented." if matched or disc else
                     "Insufficient comparable data: the document and the site database do not share common metric/period pairs.",
        }
    elif lang == "kz":
        base = {
            "doc": f"«{src}» құжатында (есеп жыл {year}) {len(doc.get('records', []))} шығарылған мән бар.",
            "match": f"{len(matched)} мән сайт дерекқорымен сәйкес келеді (1% ішінде).",
            "diff": f"{len(disc)} сәйкессіздік назарды қажет етеді.",
            "new": f"{len(new)} мән сайт дерекқорында жоқ — тексеруден кейін импортталуы мүмкін.",
            "caveat": "Барлық сандар құжаттан және сайт дерекқорынан алынды; ешбір мән ойша қосылған жоқ." if (matched or disc) else
                     "Салыстыруға деректер жеткіліксіз: құжат пен сайт дерекқорында ортақ көрсеткіш/кезең жұптары жоқ.",
        }
    else:
        base = {
            "doc": f"В документе «{src}» (отчётный год {year}) извлечено {len(doc.get('records', []))} значений.",
            "match": f"{len(matched)} значений совпадает с базой сайта (в пределах 1%).",
            "diff": f"{len(disc)} несовпадений требуют внимания.",
            "new": f"{len(new)} значений отсутствуют в базе сайта и могут быть импортированы после проверки.",
            "caveat": "Все цифры получены напрямую из документа и базы сайта; ни одно значение не было придумано." if (matched or disc) else
                     "Сравнению недостаточно данных: в документе и базе сайта нет общих пар «показатель/период».",
        }
    base["sources"] = [src, "site database (published reports 09.2026)"]
    return base

def build_findings(doc_records, comp, lang="ru"):
    comp = _comp(comp)
    findings = []
    labels = {
        "ru": {"top": "Ключевые изменения", "disc": "Несовпадения", "new": "Новые данные", "review": "Требуют проверки"},
        "en": {"top": "Key changes", "disc": "Discrepancies", "new": "New data", "review": "Needs review"},
        "kz": {"top": "Негізгі өзгерістер", "disc": "Сәйкессіздіктер", "new": "Жаңа деректер", "review": "Тексеруді қажет етеді"},
    }[lang]

    # biggest discrepancies
    for d in sorted(comp["discrepancies"], key=lambda x: abs(x["pct_diff"] or 0), reverse=True)[:5]:
        findings.append({
            "type": "disc",
            "text": (f"{d['metric']}, {d['region']} ({d['period']}): "
                     f"документ {_fmt(d['doc_value'], d['unit'])}, сайт {_fmt(d['site_value'], d['unit'])} "
                     f"(Δ {_pct(d['pct_diff'])})" if lang == "ru" else
                     f"{d['metric']}, {d['region']} ({d['period']}): "
                     f"document {_fmt(d['doc_value'], d['unit'])}, site {_fmt(d['site_value'], d['unit'])} "
                     f"(Δ {_pct(d['pct_diff'])})" if lang == "en" else
                     f"{d['metric']}, {d['region']} ({d['period']}): "
                     f"құжат {_fmt(d['doc_value'], d['unit'])}, сайт {_fmt(d['site_value'], d['unit'])} "
                     f"(Δ {_pct(d['pct_diff'])})"),
            "sources": [d.get("doc_source"), d.get("site_source")],
            "reasons": d.get("possible_reasons", []),
        })

    # top growth among matched
    growth = [m for m in comp["matched"] if m["pct_diff"] is not None and abs(m["pct_diff"]) >= 0.1]
    for m in sorted(growth, key=lambda x: abs(x["pct_diff"]), reverse=True)[:5]:
        findings.append({
            "type": "top",
            "text": f"{m['metric']}, {m['region']} ({m['period']}): {m['unit']} {_fmt(m['doc_value'], m['unit'])} — расхождение со сайтом {_pct(m['pct_diff'])}"
                    if lang == "ru" else
                    f"{m['metric']}, {m['region']} ({m['period']}): {m['unit']} {_fmt(m['doc_value'], m['unit'])} — site deviation {_pct(m['pct_diff'])}"
                    if lang == "en" else
                    f"{m['metric']}, {m['region']} ({m['period']}): {m['unit']} {_fmt(m['doc_value'], m['unit'])} — сайттан ауытқу {_pct(m['pct_diff'])}",
            "sources": [m.get("doc_source"), m.get("site_source")],
        })

    for n_ in comp["new_in_document"][:8]:
        findings.append({
            "type": "new",
            "text": f"{n_['metric']}, {n_['region']} ({n_['period']}) = {_fmt(n_['doc_value'], n_['unit'])} — отсутствует в базе сайта"
                    if lang == "ru" else
                    f"{n_['metric']}, {n_['region']} ({n_['period']}) = {_fmt(n_['doc_value'], n_['unit'])} — not in site DB"
                    if lang == "en" else
                    f"{n_['metric']}, {n_['region']} ({n_['period']}) = {_fmt(n_['doc_value'], n_['unit'])} — сайт дерекқорында жоқ",
            "sources": [n_.get("doc_source")],
        })

    review = [r for r in doc_records if r.get("check_status") == "needs_review"][:10]
    for r in review:
        findings.append({
            "type": "review",
            "text": f"Значение {r['value']} («{r['metric_name']}, {r['region']}, {r['period']}») требует проверки",
            "sources": [f"{r['source']} / {r['source_sheet']}"],
        })
    return findings

def answer_question(question, doc_records, db_records, comp, lang="ru"):
    """Rule-based Q&A over the data. Returns answer text + sources.
    Only answers from actual data; otherwise says so explicitly."""
    q = (question or "").lower()
    sources = []
    all_recs = []
    for r in doc_records:
        all_recs.append(("doc", r))
    for r in db_records:
        all_recs.append(("site", r))
    def pick(metric_substr, region_substr):
        res = []
        for tag, r in all_recs:
            if metric_substr.lower() in r["metric_name"].lower() and (region_substr is None or region_substr.lower() in r["region"].lower()):
                res.append((tag, r))
        return res

    REGNAMES = ["Кызылординская область", "Кызылорда", "Байконыр", "Аральский", "Жалагашский", "Жанакорганский", "Казалинский", "Кармакшинский", "Сырдарьинский", "Шиелийский"]

    def find_region():
        for regname in REGNAMES:
            if regname.lower() in q:
                return regname
        return None

    def kind_from_q():
        if "горно" in q or "нефт" in q:
            return "mining"
        if "обрабатыв" in q:
            return "processing"
        if "энерг" in q or "электро" in q:
            return "utility"
        if "вод" in q or "отход" in q:
            return "water"
        if "газ" in q:
            return "utility"
        return "industry_total"

    def label(tag, r):
        prefix = "Документ: " if tag == "doc" else "Сайт: "
        y = f', {r["year"]}' if tag == "doc" else ""
        return f"{prefix}{r['metric_name']}, {r['region']}{y} {r['period']} = {r['value']} {r['unit']}"

    if any(w in q for w in ["индекс", "индексі", "index"]):
        kind = kind_from_q()
        reg = find_region()
        if kind is None:
            return {"answer": "Уточните, индекс какого направления: всего, горнодобывающей, обрабатывающей, энергетики или водоснабжения.", "sources": []}
        data = pick("Обрабатывающая" if kind == "processing" else "Горнодобывающая" if kind == "mining" else "Снабжение" if kind == "utility" else "Водоснабжение" if kind == "water" else "Промышленность", reg)
        lines = []
        for tag, r in data[:8]:
            lines.append(label(tag, r))
            sources.append(r["source"])
        if not lines:
            return {"answer": "В загруженных данных такого показателя нет — сравнить нечего.", "sources": []}
        return {"answer": ";\n".join(lines), "sources": list(dict.fromkeys(sources))}

    if any(w in q for w in ["объем", "объём", "volume", "көлем"]):
        reg = find_region()
        data = pick("всего", reg)
        lines = []
        for tag, r in data[:8]:
            lines.append(label(tag, r))
            sources.append(r["source"])
        if not lines:
            return {"answer": "Объём производства для запрошенного разреза в данных не найден.", "sources": []}
        return {"answer": ";\n".join(lines), "sources": list(dict.fromkeys(sources))}

    if any(w in q for w in ["расхожд", "не совпа", "разниц", "айырмашылық", "difference"]):
        comp = _comp(comp)
        top = sorted(comp["discrepancies"], key=lambda x: abs(x["pct_diff"] or 0), reverse=True)[:5]
        if not top:
            return {"answer": "Значимых расхождений между документом и базой сайта не обнаружено.", "sources": []}
        lines = [f"{d['metric']}, {d['region']} ({d['period']}): {_fmt(d['doc_value'])} vs {_fmt(d['site_value'])} ({_pct(d['pct_diff'])})" for d in top]
        return {"answer": "Крупнейшие расхождения:\n" + ";\n".join(lines),
                "sources": list(dict.fromkeys([d.get("doc_source") for d in top if d.get("doc_source")] + [d.get("site_source") for d in top if d.get("site_source")]))}

    if any(w in q for w in ["рост", "выросл", "вырос", "увелич", "өсу"]):
        comp = _comp(comp)
        items = [d for d in comp["discrepancies"] if d.get("pct_diff") is not None and d["pct_diff"] > 0]
        items = sorted(items, key=lambda x: x["pct_diff"], reverse=True)[:5]
        if not items:
            return {"answer": "По имеющимся данным роста не зафиксировано.", "sources": []}
        lines = [f"{d['metric']}, {d['region']} ({d['period']}): {_pct(d['pct_diff'])} к значению сайта" for d in items]
        return {"answer": ";\n".join(lines), "sources": list(dict.fromkeys([d.get("doc_source") for d in items if d.get("doc_source")]))}

    return {"answer": "По этому вопросу в текущих данных нет ответа. Я отвечаю только на основании извлечённых из документа и базы сайта значений.", "sources": []}
