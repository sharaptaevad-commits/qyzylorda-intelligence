import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { Spinner, ErrorBox, useFmt } from "../components/ui";

// Districts & cities comparison table (canonical names, compatible periods only).
// Local cumulative-period label (frontend analogue of backend _cum_local).
// "январь-сентябрь" -> "қаңтар–қыркүйек (сумм.)" for the active language.
function cumLabel(period: string, t: (k: string) => string, lang: string): string {
  if (!period) return "";
  const s = period.trim().toLowerCase();
  const m = s.match(/^январь-(\w+)$/);
  const i18nMonth: Record<string, Record<number, string>> = {
    kk: {1:"қаңтар",2:"ақпан",3:"наурыз",4:"сәуір",5:"мамыр",6:"маусым",7:"шілде",8:"тамыз",9:"қыркүйек",10:"қазан",11:"қараша",12:"желтоқсан"},
    ru: {1:"январь",2:"февраль",3:"март",4:"апрель",5:"май",6:"июнь",7:"июль",8:"август",9:"сентябрь",10:"октябрь",11:"ноябрь",12:"декабрь"},
    en: {1:"January",2:"February",3:"March",4:"April",5:"May",6:"June",7:"July",8:"August",9:"September",10:"October",11:"November",12:"December"},
  };
  const months = i18nMonth[lang] || i18nMonth.ru;
  const monthList = Object.keys(months).map((k) => months[Number(k)]);
  const endIdx = m ? monthList.findIndex((nm) => nm.toLowerCase().startsWith(m[1].slice(0, 4))) : monthList.findIndex((nm) => s === nm.toLowerCase() || s.startsWith(nm.toLowerCase()));
  const n = endIdx >= 0 ? endIdx + 1 : null;
  if (n === null) return period; // unknown -> raw
  if (n === 1) return months[1];
  // Annual window (jan–dec): full-year cumulative label.
  if (n === 12) return t("cumulative_jan_to").replace("{m}", months[12]);
  return t("cumulative_jan_to").replace("{m}", months[n]);
}

export default function Comparative() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const { num } = useFmt();

  const [periods, setPeriods] = useState<any[]>([]);
  const [period, setPeriod] = useState<string>("");
  const [year, setYear] = useState<number>(2026);
  const [metric, setMetric] = useState<string>("industry_total");
  const [unit, setUnit] = useState<string>("%");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "value", dir: -1 });
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [comparePeriod, setComparePeriod] = useState<string>(""); // '' = auto (same period, prior year)

  useEffect(() => {
    setErr(null);
    api.periods({ metric: "industry_total", unit: "%", lang }).then((p: any) => {
      setPeriods(p.periods || []);
      const last = p.periods?.[p.periods.length - 1];
      if (last) { setPeriod(last.period); setYear(last.year); }
    }).catch(setErr);
  }, [lang]);

  // Prior-year periods available for comparison (same month or any) — for the manual pick.
  const compareOptions = useMemo(() => {
    const y = year - 1;
    return periods.filter((p) => p.year === y);
  }, [periods, year]);

  useEffect(() => {
    if (!period) return;
    setErr(null);
    api.districtCompare({ metric, period, year: String(year), unit, lang, compare_year: String(year - 1), compare_period: comparePeriod || period })
      .then(setData).catch(setErr);
  }, [period, metric, unit, year, lang, comparePeriod]);

  const rows = useMemo(() => {
    if (!data?.rows) return [];
    let r = data.rows;
    if (search) r = r.filter((x: any) => x.label.toLowerCase().includes(search.toLowerCase()));
    r = [...r].sort((a: any, b: any) => {
      const av = a[sort.key] ?? -Infinity, bv = b[sort.key] ?? -Infinity;
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
    });
    return r;
  }, [data, search, sort]);

  const toggleSort = (key: string) =>
    setSort((s) => s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 });

  const metrics = [
    { key: "industry_total", unit: "%", label: t("metric_index") },
    { key: "processing", unit: "%", label: t("cmp_processing") },
    { key: "industry_total", unit: "тыс. теңге", label: t("cmp_volume") },
  ];

  if (err) return <ErrorBox error={err} />;
  if (!data) return <Spinner />;

  const isVolume = unit === "тыс. теңге";
  const valueHeader = isVolume ? t("cmp_volume_col") : t("cmp_index_col");
  const mismatch = !!data?.period_mismatch;
  const compareMissing = data.compare_year == null;
  // Local period labels for the header (e.g. "2025 қаңтар–қыркүйек (сумм.)")
  const selPeriodLocal = cumLabel(data?.period || period, t, lang);
  const cmpPeriodLocal = cumLabel(data?.compare_period || comparePeriod || period, t, lang);
  const compareHeader = t("cmp_compare_year_full", { y: (year - 1), p: cmpPeriodLocal });
  const mismatchTip = t("cmp_mismatch_tip", { a: `${year} ${selPeriodLocal}`, b: `${year - 1} ${cmpPeriodLocal}` });

  return (
    <div className="space-y-5">
      <div className="card card-pad">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label={t("cmp_period")}>
            <select className="f-input" value={period} onChange={(e) => {
              const p = periods.find((x) => x.period === e.target.value);
              if (p) { setPeriod(p.period); setYear(p.year); }
            }}>
              {periods.map((p) => (
                <option key={`${p.year}-${p.period}`} value={p.period}>{p.year} {cumLabel(p.period, t, lang)}</option>
              ))}
            </select>
          </Field>
          <Field label={t("cmp_compare_pick")}>
            <select className="f-input" value={comparePeriod} onChange={(e) => setComparePeriod(e.target.value)}>
              <option value="">{t("cmp_default_period")} ({year - 1})</option>
              {compareOptions.map((p) => (
                <option key={`c-${p.period}`} value={p.period}>{year - 1} {cumLabel(p.period, t, lang)}</option>
              ))}
            </select>
          </Field>
          <Field label={t("cmp_metric")}>
            <select className="f-input" value={metric + unit} onChange={(e) => {
              const m = metrics.find((x) => x.key + x.unit === e.target.value);
              if (m) { setMetric(m.key); setUnit(m.unit); }
            }}>
              {metrics.map((m) => <option key={m.key + m.unit} value={m.key + m.unit}>{m.label}</option>)}
            </select>
          </Field>
          <Field label={t("cmp_search")}>
            <input className="f-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("cmp_search")} />
          </Field>
        </div>
        {mismatch && (
          <div className="mt-3 flex items-start gap-2 text-xs px-3 py-2 rounded bg-[#FEF3C7] text-[#B45309]" title={mismatchTip}>
            <span>⚠</span><span>{t("cmp_mismatch")}</span>
          </div>
        )}
      </div>

      <div className="card card-pad overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-[#E3E8F0] text-left">
              <Th onClick={() => toggleSort("label")} active={sort.key === "label"} dir={sort.dir}>{t("cmp_district")}</Th>
              <Th onClick={() => toggleSort("value")} active={sort.key === "value"} dir={sort.dir} right>{valueHeader}</Th>
              <th className="py-2 pr-3 text-right text-surface-500" title={compareMissing ? t("cmp_no_compare") : mismatchTip}>{compareHeader}</th>
              <Th onClick={() => toggleSort("delta")} active={sort.key === "delta"} dir={sort.dir} right title={t("cmp_delta_tip")}>{t("cmp_delta")} <RefBadge/></Th>
              <th className="py-2 pr-3 text-surface-500">{t("cmp_source")}</th>
              <th className="py-2 text-surface-500">{t("cmp_status")}</th>
            </tr>
          </thead>
          <tbody>
            {data.oblast && (
              <tr className="bg-[#F1F5FB] border-b border-[#E3E8F0]">
                <td className="py-2 pr-3 font-semibold text-[#0F2A4A]">{t("cmp_oblast_row")}</td>
                <td className="py-2 pr-3 text-right num font-bold">{data.oblast.value != null ? `${num(data.oblast.value)}${isVolume ? "" : "%"}` : "—"}</td>
                <td className="py-2 pr-3 text-right num">{data.oblast.compare != null ? num(data.oblast.compare) : "—"}</td>
                <td className="py-2 pr-3 text-right num" style={{ color: (data.oblast.delta ?? 0) >= 0 ? "#16A34A" : "#DC2626" }}>
                  {data.oblast.delta != null ? `${data.oblast.delta >= 0 ? "▲" : "▼"} ${num(Math.abs(data.oblast.delta))}${isVolume ? "" : " п.п."}` : <span title={compareMissing ? t("cmp_no_compare") : mismatchTip}>—</span>}
                </td>
                <td className="py-2 pr-3 text-xs text-surface-500" title={`${t("cmp_source_full", { src: data.oblast.source_full || data.oblast.source })}{data.oblast.compare_source ? " · " + t("cmp_source_full", { src: data.oblast.compare_source }) : ""}`}>
                  {data.oblast.source}{data.oblast.compare_source ? <span className="text-surface-400"> · {data.oblast.compare_source}</span> : null}
                </td>
                <td className="py-2"><StatusBadge status="verified" t={t} /></td>
              </tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b border-[#F1F5FB] hover:bg-[#F8FAFD]">
                <td className="py-2 pr-3 text-[#0F2A4A]">{r.label}</td>
                <td className="py-2 pr-3 text-right num font-semibold">
                  {r.value != null ? `${num(r.value)}${isVolume ? "" : "%"}` : "—"}
                </td>
                <td className="py-2 pr-3 text-right num">{r.compare != null ? num(r.compare) : "—"}</td>
                <td className="py-2 pr-3 text-right num" style={{ color: (r.delta ?? 0) >= 0 ? "#16A34A" : "#DC2626" }}>
                  {r.delta != null ? `${r.delta >= 0 ? "▲" : "▼"} ${num(Math.abs(r.delta))}${isVolume ? "" : " п.п."}`
                    : <span title={compareMissing ? t("cmp_no_compare") : mismatchTip}>—</span>}
                </td>
                <td className="py-2 pr-3 text-xs text-surface-500" title={`${t("cmp_source_full", { src: r.source_full || r.source })}{r.compare_source ? " · " + t("cmp_source_full", { src: r.compare_source }) : ""}`}>
                  {r.source}{r.compare_source ? <span className="text-surface-400"> · {r.compare_source}</span> : null}
                </td>
                <td className="py-2"><StatusBadge status={r.status} t={t} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<label className="block"><span className="block text-xs font-medium text-surface-500 mb-1">{label}</span>{children}</label>);
}

function Th({ children, onClick, active, dir, right, title }: { children: React.ReactNode; onClick?: () => void; active?: boolean; dir?: 1 | -1; right?: boolean; title?: string }) {
  return (
    <th onClick={onClick} title={title}
      className={`py-2 pr-3 text-surface-500 ${onClick ? "cursor-pointer select-none" : ""} ${right ? "text-right" : ""}`}>
      {children}{active && (dir === 1 ? " ↑" : " ↓")}
    </th>
  );
}

// Status synced with the Alerts page: review = "needs review" (neutral).
function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const map: Record<string, { cls: string; label: string; tip?: string }> = {
    verified: { cls: "bg-[#DCFCE7] text-[#15803D]", label: t("status_verified") },
    unverified: { cls: "bg-[#FEF3C7] text-[#B45309]", label: t("status_unverified") },
    review: { cls: "bg-[#FEF3C7] text-[#B45309]", label: t("al_needs_review"), tip: t("cmp_status_review_tip") },
    no_data: { cls: "bg-[#F1F5F9] text-[#64748B]", label: t("status_no_data") },
  };
  const m = map[status] || map.no_data;
  return <span title={m.tip} className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${m.cls}`}>{m.label}</span>;
}

// Reference (site-calculated) badge — marks values the site itself computed (e.g. delta).
function RefBadge() {
  const { t } = useTranslation();
  return (
    <span title={t("badge_reference_tip")} className="inline-block ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-surface-100 text-surface-500 border border-surface-200 cursor-help align-middle">
      {t("badge_reference")}
    </span>
  );
}
