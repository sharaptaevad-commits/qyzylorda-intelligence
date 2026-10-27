import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { api } from "../api";
import { Spinner, ErrorBox, useFmt } from "./ui";

// "Monthly volume" — derived by differencing adjacent CUMULATIVE volumes.
// Only shown when volume data exists. A month is null (gap, not 0) unless both
// adjacent cumulative periods exist. Negative delta (correction/review) is
// flagged, never hidden. Compare year rendered as a grey bar group.
export default function VolumeMonthlyChart({
  metric = "industry_total", region, year = 2026, compareYear,
}: {
  metric?: string; region?: string; year?: number; compareYear?: number;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const { num, locale } = useFmt();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<any>(null);

  useEffect(() => {
    setErr(null);
    api.volumeMonthly({ metric, region: region || "", year: String(year), compare_year: String(compareYear || year - 1), unit: "тыс. теңге", lang })
      .then(setData).catch(setErr);
  }, [metric, region, year, compareYear, lang]);

  const shortMonth = (m: number) => t(`month_short_${m}`);

  const chartData = useMemo(() => {
    if (!data?.series) return [];
    // convert thousands of tenge -> млрд тг (value / 1e6) for display
    return data.series.map((s: any) => ({
      name: shortMonth(s.month),
      value: s.value != null ? s.value / 1e6 : null,
      compare: s.compare != null ? s.compare / 1e6 : null,
      needs_review: s.needs_review,
    }));
  }, [data, lang]);

  if (err) return <ErrorBox error={err} />;
  if (!data) return <Spinner />;

  const hasData = chartData.some((d: any) => d.value != null || d.compare != null);
  if (!hasData) return <div className="text-sm text-txt2 py-6 text-center">{t("empty_state")}</div>;

  return (
    <div>
      <div className="text-xs text-txt2 mb-1">
        {t("chart_volume_monthly")} · {t("volume_current_price_note")}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={1}>
          <CartesianGrid stroke="#E5E9F0" strokeWidth={1} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748B" }} tickLine={false} axisLine={{ stroke: "#CBD5E1" }} interval={0} />
          <YAxis tick={{ fontSize: 12, fill: "#64748B" }} tickLine={false} axisLine={{ stroke: "#CBD5E1" }} width={44} tickFormatter={(v) => num(v)} />
          <Tooltip formatter={(v: any, name: any) =>
            v == null ? ["—", name] : [num(v) + " " + t("unit_bln"), name]} />
          <Legend verticalAlign="top" align="center" iconType="square" wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} formatter={(v) => v === "value" ? t("legend_current_year") : t("legend_compare_year")} />
          <Bar dataKey="compare" name="compare" fill="#94A3B8" radius={[2, 2, 0, 0]} />
          <Bar dataKey="value" name="value" fill="#0EA5A4" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="sr-only">
        {chartData.filter((d: any) => d.value != null).map((d: any) =>
          `${d.name}: ${num(d.value)} ${t("unit_bln")}${d.needs_review ? " (⚠ " + t("status_review") + ")" : ""}`).join("; ")}
      </div>
    </div>
  );
}
