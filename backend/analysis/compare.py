# -*- coding: utf-8 -*-
"""Stage 3: compare document records with site DB records.
Groups: A matched, B discrepancies/not-comparable, C in-doc-not-in-site, D in-site-not-in-doc.
"""
from collections import defaultdict
from .common import period_key

TOL_PCT = 1.0

def compare(doc_records, db_records):
    A, B, C, D = [], [], [], []
    db_used = set()

    idx = defaultdict(list)
    for r in db_records:
        idx[(r["metric_key"], r["region"], period_key(r["period"]))].append(r)

    for d in doc_records:
        pk = period_key(d["period"])
        cands = idx.get((d["metric_key"], d["region"], pk), [])
        same_unit = [c for c in cands if (c["unit"] or "") == (d["unit"] or "")]
        if same_unit:
            dbi = same_unit[0]
            db_used.add((dbi["metric_key"], dbi["region"], pk, dbi["unit"]))
            diff = d["value"] - dbi["value"]
            pct = (diff / dbi["value"] * 100) if dbi["value"] else None
            entry = {
                "metric": d.get("metric_name") or d.get("metric_key"),
                "metric_key": d["metric_key"],
                "region": d["region"],
                "period": d["period"],
                "unit": d["unit"],
                "doc_value": d["value"],
                "site_value": dbi["value"],
                "abs_diff": diff,
                "pct_diff": pct,
                "doc_source": f'{d["source"]} / {d["source_sheet"]}',
                "site_source": f'{dbi["source"]} / {dbi["source_sheet"]}',
            }
            if pct is not None and abs(pct) <= TOL_PCT:
                entry["status"] = "match"
                A.append(entry)
            else:
                reasons = []
                if (d["unit"] or "") != (dbi["unit"] or ""):
                    reasons.append("unit_mismatch")
                if pk != period_key(dbi["period"]):
                    reasons.append("period_mismatch")
                if d.get("year") != dbi.get("year"):
                    reasons.append("different_year")
                entry["possible_reasons"] = reasons or ["data_difference"]
                entry["status"] = "discrepancy"
                B.append(entry)
        elif cands:
            first = cands[0]
            db_used.add((first["metric_key"], first["region"], pk, first["unit"]))
            B.append({
                "metric": d.get("metric_name") or d.get("metric_key"),
                "metric_key": d["metric_key"],
                "region": d["region"],
                "period": d["period"],
                "unit": d["unit"],
                "doc_value": d["value"],
                "site_value": first["value"],
                "abs_diff": None,
                "pct_diff": None,
                "doc_source": f'{d["source"]} / {d["source_sheet"]}',
                "site_source": f'{first["source"]} / {first["source_sheet"]}',
                "possible_reasons": ["unit_mismatch"],
                "status": "not_comparable",
            })
        else:
            has_any = any(r["metric_key"] == d["metric_key"] and r["region"] == d["region"] for r in db_records)
            if has_any:
                B.append({
                    "metric": d.get("metric_name") or d.get("metric_key"),
                    "metric_key": d["metric_key"],
                    "region": d["region"],
                    "period": d["period"],
                    "unit": d["unit"],
                    "doc_value": d["value"],
                    "site_value": None,
                    "abs_diff": None,
                    "pct_diff": None,
                    "doc_source": f'{d["source"]} / {d["source_sheet"]}',
                    "site_source": None,
                    "possible_reasons": ["period_not_in_site"],
                    "status": "not_comparable",
                })
            else:
                C.append({
                    "metric": d.get("metric_name") or d.get("metric_key"),
                    "metric_key": d["metric_key"],
                    "region": d["region"],
                    "period": d["period"],
                    "unit": d["unit"],
                    "doc_value": d["value"],
                    "doc_source": f'{d["source"]} / {d["source_sheet"]}',
                    "status": "new_in_document",
                })

    doc_cov = {(r["metric_key"], r["region"]) for r in doc_records}
    doc_periods = {(r["metric_key"], r["region"], period_key(r["period"])) for r in doc_records}
    seen = set()
    for r in db_records:
        key = (r["metric_key"], r["region"], period_key(r["period"]), r["unit"])
        if key in db_used:
            continue
        if (r["metric_key"], r["region"]) not in doc_cov:
            continue
        if (r["metric_key"], r["region"], period_key(r["period"])) in doc_periods:
            continue
        if (r["metric_key"], r["region"]) in seen:
            continue
        seen.add((r["metric_key"], r["region"]))
        D.append({
            "metric": r["metric_name"],
            "metric_key": r["metric_key"],
            "region": r["region"],
            "period": r["period"],
            "unit": r["unit"],
            "site_value": r["value"],
            "site_source": f'{r["source"]} / {r["source_sheet"]}',
            "status": "not_in_document",
        })

    return {"matched": A, "discrepancies": B, "new_in_document": C, "missing_in_document": D}
