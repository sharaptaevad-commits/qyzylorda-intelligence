import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, download } from "../api";
import { Spinner, ErrorBox, Empty, SectionTitle, useFmt } from "../components/ui";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const METRICS = ["industry_total", "mining", "processing", "utility", "water"];
const REGIONS = ["Кызылординская область", "Кызылорда г.а", "Байконыр г.а", "Аральский",
  "Жалагашский", "Жанакорганский", "Казалинский", "Кармакшинский", "Сырдарьинский", "Шиелийский"];

export default function District() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const { num } = useFmt();
  const [metric, setMetric] = useState("industry_total");
  const [unit, setUnit] = useState("%");
  const [month, setMonth] = useState(9);
  const [rows, setRows] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setErr(null); setLoading(true);
    api.district({ metric, unit, month: String(month), lang }).then(d => setRows(d.rows || [])).catch(setErr).finally(() => setLoading(false));
  }, [metric, unit, month, lang]);

  useEffect(() => {
    if (!sel) { setDetail(null); return; }
    api.districtDetail(sel, lang).then(setDetail).catch(() => setDetail(null));
  }, [sel, lang]);

  if (err) return <ErrorBox error={err} />;
  // flag outliers (>2x median) for review — value never hidden
  const vals = rows.map(r => r.value).filter((v: any) => v != null).sort((a: any, b: any) => a - b);
  const median = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
  const flagged = new Set(rows.filter(r => r.value != null && Math.abs(r.value) >= 2 * Math.max(Math.abs(median), 1)).map(r => r.region));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold">{t("district_title")}</h1>
          <div className="text-xs text-txt2">{t("current_period")}: {month} · 2026</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="select w-auto" value={metric} onChange={e => setMetric(e.target.value)}>
            {METRICS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="select w-auto" value={unit} onChange={e => setUnit(e.target.value)}>
            <option value="%">%</option><option value="тыс. теңге">тыс. теңге</option>
          </select>
          <select className="select w-auto" value={month} onChange={e => setMonth(Number(e.target.value))}>
            {[9, 8, 7].map(m => <option key={m} value={m}>{t("month")} {m}</option>)}
          </select>
        </div>
      </div>

      <div className="card card-pad">
        <SectionTitle>{t("chart_districts")}</SectionTitle>
        {loading ? <Spinner /> : rows.length ? (
          <ResponsiveContainer width="100%" height={Math.max(260, rows.length * 28)}>
            <BarChart data={rows.map(d => ({ ...d, name: d.label }))} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid stroke="#E5E9F0" strokeWidth={1} />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#64748B" }} tickLine={false} axisLine={{ stroke: "#CBD5E1" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#64748B" }} tickLine={false} axisLine={{ stroke: "#CBD5E1" }} width={120} />
              <Tooltip formatter={(v: any) => num(v) + "%"} />
              <Bar dataKey="value" fill="#1F5FE0" radius={[0, 3, 3, 0]} onClick={(d: any) => setSel(d.payload.region)} />
            </BarChart>
          </ResponsiveContainer>
        ) : <Empty text={t("empty_state")} />}
      </div>

      <div className="card card-pad">
        <SectionTitle>{t("district_title")}</SectionTitle>
        <table className="tbl">
          <thead><tr>
            <th>{t("region")}</th><th className="text-right">{t("value")}</th>
            <th>{t("unit")}</th><th>{t("sources")}</th><th>{t("data_availability")}</th>
          </tr></thead>
          <tbody>
            {rows.map((d, i) => (
              <tr key={i} className="cursor-pointer hover:bg-app" onClick={() => setSel(d.region)}>
                <td>{d.label}{flagged.has(d.region) && <span className="badge-warn ml-2" title={t("needs_review_flag")}>⚠ {t("needs_review_flag")}</span>}</td><td className="num">{num(d.value)}</td><td>{d.unit}</td>
                <td className="text-txt2 text-xs">{d.source}</td>
                <td><span className="badge-pos">●</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="fixed inset-y-0 right-0 w-[420px] max-w-full bg-white shadow-2xl border-l border-[#E3E8F0] p-5 overflow-y-auto z-20">
          <div className="flex items-center justify-between mb-4">
            <div className="text-base font-semibold">{detail.label}</div>
            <button className="btn-ghost" onClick={() => setSel(null)}>✕</button>
          </div>
          <div className="space-y-3">
            {METRICS.map(mk => {
              const series = detail[mk] || [];
              if (!series.length) return null;
              const v = series[series.length - 1];
              return (
                <div key={mk} className="card card-pad">
                  <div className="lbl">{mk}</div>
                  <div className="text-xl font-semibold">{num(v.value)} <span className="text-xs text-txt2">{v.unit}</span></div>
                  <div className="text-[11px] text-txt2 mt-1">{v.label} · {v.source}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
