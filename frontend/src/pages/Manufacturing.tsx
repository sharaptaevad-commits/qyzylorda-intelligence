import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { Spinner, ErrorBox, SectionTitle, useFmt, KpiCard, Empty } from "../components/ui";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine, BarChart, Bar } from "recharts";
import { Cpu, Download, Info, Factory } from "lucide-react";

const REGION = "Кызылординская область";

// Format a number to exactly 1 decimal (no long float tails like 10.199999999999989).
const f1 = (v: any): string =>
  v === null || v === undefined ? "—" : (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : String(v));

// Reference (site-calculated) badge — marks values the site itself computed.
function RefBadge({ t }: { t: (k: string) => string }) {
  return (
    <span title={t("badge_reference_tip")}
      className="inline-block ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-surface-100 text-surface-500 border border-surface-200 cursor-help align-middle">
      {t("badge_reference")}
    </span>
  );
}

// Official (Ministry) badge — marks values taken directly from the Ministry table.
function OfficialBadge({ t }: { t: (k: string) => string }) {
  return (
    <span title={t("badge_official_tip") || t("badge_official")}
      className="inline-block ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#E7F6EC] text-[#15803D] border border-[#BBE5C8] align-middle">
      {t("badge_official")}
    </span>
  );
}

// Local cumulative-period label: month number -> "қаңтар–қыркүйек (сумм.)".
function cumLabel(month: number, t: (k: string) => string): string {
  if (!month) return "";
  if (month === 1) return t("month_1");
  return t("cumulative_jan_to").replace("{m}", t(`month_${month}`));
}

// Chart tooltip: exact 1-decimal values, no long float tails, no raw "value"/"cumulative".
function DynamicsTooltip({ active, payload, label, t, year }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const parts: string[] = [label];
  if (row.value != null) parts.push(t("mfg_tooltip_cum", { v: f1(row.value) }));
  if (row.compare != null) parts.push(t("mfg_tooltip_prev", { y: year - 1, v: f1(row.compare) }));
  if (row.delta != null) parts.push(t("mfg_tooltip_delta", { d: (row.delta >= 0 ? "+" : "") + f1(row.delta) }));
  return (
    <div className="bg-white border border-[#E5E9F0] rounded-lg px-3 py-2 text-xs shadow-md">
      {parts.map((p, i) => (
        <div key={i} className={i === 0 ? "font-semibold text-[#0F2A4A] mb-0.5" : "text-surface-600"}>{p}</div>
      ))}
    </div>
  );
}

// Reduced-motion helper: disable the draw-in animation when the user prefers reduced motion.
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Manufacturing() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const { num } = useFmt();
  const [unit, setUnit] = useState("%");
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<number>(2026);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [animate, setAnimate] = useState(true);

  const vol = unit === "тыс. теңге";
  const compareYear = year - 1;

  // Discover available years for the selected metric+unit (index or volume).
  useEffect(() => {
    setErr(null);
    api.periods({ metric: "processing", unit, lang }).then((p: any) => {
      const ys: number[] = (p.periods || []).map((x: any) => Number(x.year)).filter((y: number) => Number.isFinite(y));
      const uniq = Array.from(new Set(ys) as Set<number>).sort((a: number, b: number) => b - a);
      setYears(uniq);
      if (uniq.length && !uniq.includes(year)) setYear(uniq[0]);
    }).catch(setErr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, lang]);

  // Fetch cumulative-index dynamics for the selected year (+ prior year for comparison).
  useEffect(() => {
    setErr(null);
    setAnimate(!prefersReducedMotion());
    api.indexDynamics({ metric: "processing", region: REGION, year: String(year),
      compare_year: String(compareYear), unit, lang }).then(setData).catch(setErr);
  }, [unit, year, lang, compareYear]);

  const series = data?.series || [];
  const maxMonth = data?.max_month || 0;
  const last = series.length ? series[series.length - 1] : null;

  // Y axis domain: tight around the data AND always includes the 100% reference line.
  const yDomain = useMemo<[number, number]>(() => {
    const vals = (series as any[]).map((s) => s.value).filter((v: any) => v != null) as number[];
    if (!vals.length) return [90, 110];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return [Math.min(100, Math.floor(min - 3)), Math.max(100, Math.ceil(max + 3))];
  }, [series]);

  // Volume (derived monthly) shown only when the volume unit is selected and data exists.
  const [volData, setVolData] = useState<any>(null);
  useEffect(() => {
    if (!vol) { setVolData(null); return; }
    api.volumeMonthly({ metric: "processing", region: REGION, year: String(year), unit, lang })
      .then(setVolData).catch(() => setVolData(null));
  }, [vol, year, lang]);
  const volSeries = volData?.series || [];
  const volHasData = volSeries.some((s: any) => s.value != null);

  if (err) return <ErrorBox error={err} />;
  if (!data) return <Spinner />;

  const unitLabel = unit === "%" ? "%" : t("unit_ktenge");

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 bg-[#E8F0FE] rounded-lg px-4 py-3 text-sm text-[#0B3FA8]">
        <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> <span>{t("mfg_note")}</span>
      </div>

      {/* unit + year controls */}
      <div className="card card-pad flex flex-wrap items-center gap-3">
        <select className="select w-auto" value={unit} onChange={e => setUnit(e.target.value)} aria-label={t("unit")}>
          <option value="%">{t("unit_pct")}</option>
          <option value="тыс. теңге">{t("unit_ktenge")}</option>
        </select>
        {!vol && (
          <select className="select w-auto" value={year} onChange={e => setYear(Number(e.target.value))} aria-label="year">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      {/* KPI cards — single period label, no duplication */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KpiCard title={t("kpi_mfg_index")} icon={<Cpu className="w-4 h-4" />}
          value={last?.value ?? null} unit="%" periodLabel={cumLabel(maxMonth, t) + ` ${year}`}
          source={last?.source} status="verified" />
        <KpiCard title={t("kpi_mfg_output")} icon={<Factory className="w-4 h-4" />}
          value={vol ? (volSeries[volSeries.length - 1]?.cumulative ?? null) : null}
          unit={unitLabel} periodLabel={cumLabel(maxMonth, t) + ` ${year}`}
          source={volData?.series?.[volData?.series?.length - 1]?.source ?? null}
          status="verified" showEmpty={!vol} />
      </div>

      {/* Main chart: cumulative index dynamics (2026 solid, prior year dashed) */}
      {!vol && (
        <div className="card card-pad">
          <div className="flex items-baseline gap-2 flex-wrap">
            <SectionTitle>{t("mfg_chart_title")}</SectionTitle>
          </div>
          <div className="text-xs text-surface-500 mt-0.5 mb-3">
            {t("mfg_chart_ctx", { region: data.region_label || REGION, year, unit: unitLabel })}
          </div>
          {series.filter((s: any) => s.value != null).length >= 2 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="#E5E9F0" strokeDasharray="0" vertical={false} />
                  <XAxis dataKey="label_short" tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={{ stroke: "#E5E9F0" }} interval={0} />
                  <YAxis domain={yDomain} tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<DynamicsTooltip t={t} year={year} />} />
                  <Legend
                    formatter={(v: string) => (v === "value"
                      ? <span>{t("mfg_legend_curr", { y: year })}</span>
                      : <span>{t("mfg_legend_prev", { y: compareYear })}</span>)}
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <ReferenceLine y={100} stroke="#94A3B8" strokeDasharray="4 4" strokeWidth={1} />
                  <Line type="monotone" dataKey="value" stroke="#1F5FE0" strokeWidth={2.5}
                    dot={{ r: 3, fill: "#1F5FE0", strokeWidth: 0 }} activeDot={{ r: 5 }}
                    connectNulls={false} isAnimationActive={animate} animationDuration={600} name="value" />
                  {series.some((s: any) => s.compare != null) && (
                    <Line type="monotone" dataKey="compare" stroke="#94A3B8" strokeWidth={1.5}
                      strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }}
                      connectNulls={false} isAnimationActive={animate} animationDuration={600} name="compare" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              {last?.value != null ? (
                <>
                  <div className="text-5xl font-bold text-[#0F2A4A]">{num(last.value)}<span className="text-xl text-txt2 ml-1">%</span></div>
                  <div className="text-sm text-txt2 mt-3">{t("mfg_single_period")}</div>
                </>
              ) : <Empty text={t("empty_state")} />}
            </div>
          )}
        </div>
      )}

      {/* Volume mode: show the cumulative index as the primary metric is not applicable;
          instead show the derived monthly volume bars (reference). */}
      {vol && (
        <div className="card card-pad">
          <div className="flex items-center gap-2 flex-wrap">
            <SectionTitle>{t("mfg_vol_title")}</SectionTitle>
            <RefBadge t={t} />
          </div>
          <div className="text-xs text-surface-500 mt-0.5 mb-3">
            {t("mfg_chart_ctx", { region: data.region_label || REGION, year, unit: unitLabel })}
          </div>
          {volHasData ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChartLike series={volSeries} unitLabel={unitLabel} animate={animate} t={t} year={year} />
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty text={t("empty_state")} />
          )}
        </div>
      )}

      {/* History table: Кезең | Мән | Өлшем | Дереккөз | Мәртебе */}
      <div className="card card-pad">
        <SectionTitle>{t("data_table")}</SectionTitle>
        {series.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr>
                <th>{t("period")}</th><th className="text-right">{t("value")}</th>
                <th>{t("unit")}</th><th>{t("sources")}</th><th>{t("cmp_status")}</th>
              </tr></thead>
              <tbody>{(series as any[]).filter((s) => s.value != null).map((s) => (
                <tr key={s.month}>
                  <td className="text-xs">{year} {cumLabel(s.month, t)}</td>
                  <td className="num">{f1(s.value)}{unit === "%" ? "%" : ""}</td>
                  <td className="text-xs">{unit === "%" ? "%" : t("unit_ktenge")}</td>
                  <td className="text-txt2 text-xs">{s.source || "—"}</td>
                  <td className="text-xs"><span className="inline-flex items-center gap-1 text-[#15803D] font-medium">{t("status_verified")}<OfficialBadge t={t} /></span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <Empty text={t("empty_state")} />}
      </div>
    </div>
  );
}

// Small bar chart for the derived monthly volume (reference). Uses Recharts BarChart.
function BarChartLike({ series, unitLabel, animate, t, year }: any) {
  return (
    <>
      <CartesianGrid stroke="#E5E9F0" vertical={false} />
      <XAxis dataKey="label_short" tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={{ stroke: "#E5E9F0" }} interval={0} />
      <YAxis tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} width={56}
        tickFormatter={(v: any) => (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(1) + "B" : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(0) + "M" : String(v))} />
      <Tooltip
        formatter={(v: any) => [v != null ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—", t("value")]}
        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E9F0" }} />
      <Bar dataKey="value" fill="#1F5FE0" isAnimationActive={animate} animationDuration={600} radius={[3, 3, 0, 0]}
        // null months render as gaps (no zero bars)
        maxBarSize={40} />
    </>
  );
}
