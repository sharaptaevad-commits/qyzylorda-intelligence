import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, ReferenceArea, Legend,
} from "recharts";
import { api } from "../api";
import { Spinner, ErrorBox, useFmt } from "./ui";

// "Cumulative index dynamics" — the CORRECT chart for indexes.
//  - Line 1: selected year (colored, thick). Line 2: compare year (dashed grey).
//  - 100% reference line. Y axis auto but always includes 100 (min(data,100)-5 .. max(data,100)+5).
//  - NEVER derives a monthly index. Missing month -> value null (line breaks, not 0).
//  - Tooltip: "Маусым · өспелі: 117.2% · өткен жыл: 108.1% · айырма: +9.1 п.п."
//  - Only months that exist in the selected year are plotted; the rest stay empty.
//  - If the metric is configured seasonal, inactive months are shaded ("Seasonal break").
export default function IndexDynamicsChart({
  metric = "industry_total", region, year = 2026, compareYear, tone = "#1F5FE0",
}: {
  metric?: string; region?: string; year?: number; compareYear?: number; tone?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const { num } = useFmt();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [seasonalMonths, setSeasonalMonths] = useState<number[]>([]);

  useEffect(() => {
    setErr(null);
    api.indexDynamics({ metric, region: region || "", year: String(year), compare_year: String(compareYear || year - 1), unit: "%", lang })
      .then(setData).catch(setErr);
  }, [metric, region, year, compareYear, lang]);

  // Load the (admin-only) seasonality calendar and mark inactive months for this metric.
  // Empty by default -> no shading, no behaviour change.
  useEffect(() => {
    api.seasonal().then((r: any) => {
      const cal: any[] = r.calendar || [];
      const entry = cal.find((c) => c.metric === metric && (!c.region || c.region === region))
        || cal.find((c) => c.metric === metric);
      if (entry && Array.isArray(entry.active_months)) {
        const active = new Set(entry.active_months);
        const inactive: number[] = [];
        for (let m = 1; m <= 12; m++) if (!active.has(m)) inactive.push(m);
        setSeasonalMonths(inactive);
      } else {
        setSeasonalMonths([]);
      }
    }).catch(() => setSeasonalMonths([]));
  }, [metric, region]);

  const shortMonth = (m: number) => t(`month_short_${m}`);

  const chartData = useMemo(() => {
    if (!data?.series) return [];
    return data.series.map((s: any) => ({
      name: shortMonth(s.month),
      value: s.value,
      compare: s.compare,
      delta: s.delta,
      month: s.month,
    }));
  }, [data, lang]);

  // Y domain: auto but always include 100, pad 5
  const domain = useMemo(() => {
    const vals = chartData.flatMap((d: any) => [d.value, d.compare]).filter((v: any) => v != null);
    if (!vals.length) return [90, 110] as [number, number];
    const lo = Math.min(...vals, 100) - 5;
    const hi = Math.max(...vals, 100) + 5;
    return [Math.floor(lo), Math.ceil(hi)] as [number, number];
  }, [chartData]);

  if (err) return <ErrorBox error={err} />;
  if (!data) return <Spinner />;

  const hasData = chartData.some((d: any) => d.value != null);
  // single period -> big value, not a line
  const pointCount = chartData.filter((d: any) => d.value != null).length;

  // Seasonal inactive months -> shaded bands (only when a seasonality rule exists).
  // Empty seasonality -> no bands, behaviour unchanged.
  const seasonalNames = useMemo(() => {
    if (!seasonalMonths.length) return [];
    const set = new Set(seasonalMonths);
    return chartData.filter((d: any) => set.has(d.month)).map((d: any) => d.name);
  }, [chartData, seasonalMonths]);

  if (!hasData) {
    return <div className="text-sm text-txt2 py-8 text-center">{t("empty_state")}</div>;
  }

  if (pointCount === 1) {
    const p = chartData.find((d: any) => d.value != null);
    const cmp = p.compare != null ? num(p.compare) : "—";
    const delta = p.delta != null ? `${p.delta >= 0 ? "+" : "−"}${num(Math.abs(p.delta))} ${t("delta_pp")}` : "—";
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center" role="img" aria-label={`${data.label}: ${num(p.value)}%`}>
        <div className="text-4xl font-bold text-[#0F2A4A]">{num(p.value)}<span className="text-base text-txt2 ml-1">%</span></div>
        <div className="text-sm text-txt2 mt-2">{data.region_label} · {data.year} {t("cumulative_note")}</div>
        <div className="text-[12px] text-txt2 mt-1">
          {t("legend_compare_year")}: {cmp}% · {t("cmp_delta")}: <span style={{ color: (p.delta || 0) >= 0 ? "#16A34A" : "#DC2626" }}>{delta}</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-txt2">
          {data.label} · {data.region_label} · {data.year} · {t("unit_pct")} · {t("cumulative_note")}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="#E5E9F0" strokeWidth={1} />
          {seasonalNames.map((nm: string) => (
            <ReferenceArea key={nm} x1={nm} x2={nm} fill="#F1F5F9" fillOpacity={0.6} stroke="none" />
          ))}
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748B" }} tickLine={false} axisLine={{ stroke: "#CBD5E1" }} interval={0} />
          <YAxis tick={{ fontSize: 12, fill: "#64748B" }} tickLine={false} axisLine={{ stroke: "#CBD5E1" }} width={44} domain={domain} tickFormatter={(v) => num(v)} />
          <ReferenceLine y={100} stroke="#94A3B8" strokeWidth={1} strokeDasharray="4 4"
            label={{ value: t("line_100"), position: "insideTopRight", fontSize: 11, fill: "#64748B" }} />
          <Tooltip
            labelStyle={{ fontSize: 11 }}
            formatter={(v: any, name: any, item: any) => {
              const p = item?.payload;
              if (name === "value") return [`${v == null ? "—" : num(v)}%`, t("legend_current_year")];
              if (name === "compare") return [`${v == null ? "—" : num(v)}%`, t("legend_compare_year")];
              return [v == null ? "—" : `${v >= 0 ? "+" : "−"}${num(Math.abs(v))} ${t("delta_pp")}`, t("cmp_delta")];
            }}
            content={<CustomTip num={num} />}
          />
          <Legend verticalAlign="top" align="center" iconType="plainline" wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} formatter={(v) => v === "value" ? t("legend_current_year") : v === "compare" ? t("legend_compare_year") : v} />
          {seasonalNames.length > 0 && (
            <div className="flex items-center justify-center gap-2 text-[11px] text-surface-500 mt-1">
              <span className="inline-block w-3 h-3 rounded-sm bg-[#F1F5F9] border border-surface-200" />
              {t("seasonal_break")}
            </div>
          )}
          <Line type="linear" dataKey="compare" name="compare" stroke="#94A3B8" strokeWidth={1.5}
            strokeDasharray="6 4" dot={{ r: 2, fill: "#94A3B8", stroke: "none" }} activeDot={{ r: 5 }}
            connectNulls={false} isAnimationActive={true} animationDuration={600} />
          <Line type="linear" dataKey="value" name="value" stroke={tone} strokeWidth={2}
            dot={{ r: 3, fill: tone, stroke: "none" }} activeDot={{ r: 5, fill: tone, stroke: "none" }}
            connectNulls={false} isAnimationActive={true} animationDuration={600} />
        </LineChart>
      </ResponsiveContainer>
      <div className="sr-only">
        {chartData.filter((d: any) => d.value != null).map((d: any) =>
          `${d.name}: ${num(d.value)}%${d.compare != null ? `, ${t("legend_compare_year")} ${num(d.compare)}%` : ""}${d.delta != null ? `, ${t("cmp_delta")} ${d.delta >= 0 ? "+" : "−"}${num(Math.abs(d.delta))} ${t("delta_pp")}` : ""}`)
          .join("; ")}
      </div>
    </div>
  );
}

function CustomTip({ active, payload, label, num }: any) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="card card-pad !p-2 text-[11px] leading-relaxed">
      <div className="font-semibold text-[#0F2A4A] mb-0.5">{label}</div>
      {p.value != null && <div>{t("legend_current_year")}: {num(p.value)}%</div>}
      {p.compare != null && <div>{t("legend_compare_year")}: {num(p.compare)}%</div>}
      {p.delta != null && (
        <div style={{ color: p.delta >= 0 ? "#16A34A" : "#DC2626" }}>
          {t("cmp_delta")}: {p.delta >= 0 ? "▲ +" : "▼ −"}{num(Math.abs(p.delta))} п.п.
        </div>
      )}
    </div>
  );
}
