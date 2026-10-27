import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Spinner, ErrorBox, Empty, KpiCard, SectionTitle, useFmt, StatusBadge } from "../components/ui";
import Hero from "../components/Hero";
import SummaryPanel from "../components/SummaryPanel";
import SectorCards from "../components/SectorCards";
import DistrictBars from "../components/DistrictBars";
import { OBLAST } from "../components/regions";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar,
} from "recharts";
import { Factory, TrendingUp, Cpu, Gauge, Activity } from "lucide-react";

const COLORS = ["#1F5FE0", "#0EA5A4", "#F59E0B", "#64748B"];

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const { num, locale } = useFmt();
  const [data, setData] = useState<any>(null);
  const [districtData, setDistrictData] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [fc, setFc] = useState<any>(null);

  useEffect(() => { setErr(null); api.dashboard(lang).then(setData).catch(setErr); }, [lang]);
  // Load forecast only if the feature flag is enabled (check settings first to avoid
  // a guaranteed 404 when forecast is disabled).
  useEffect(() => {
    api.settings().then((s: any) => {
      if (s?.forecast_enabled) {
        api.forecast({ metric: "industry_total", unit: "%", horizon: 3, lang }).then(setFc).catch(() => {});
      }
    }).catch(() => {});
  }, [lang]);
  // load one-period district comparison (latest period, vs prior year)
  useEffect(() => {
    api.periods({ metric: "industry_total", unit: "%", lang }).then((p: any) => {
      const last = p.periods?.[p.periods.length - 1];
      if (last) {
        api.districtCompare({ metric: "industry_total", period: last.period, year: String(last.year), compare_year: String(last.year - 1), unit: "%", lang })
          .then(setDistrictData).catch(() => {});
      }
    }).catch(() => {});
  }, [lang]);

  if (err) return <ErrorBox error={err} />;
  if (!data) return <Spinner />;

  const kc = data.kpi_cards || {};
  const indTrend = data.industrial_trend || [];
  const mfgTrend = data.mfg_trend || [];
  const structure = data.structure || [];
  // one-period district data (deduped, oblast separate)
  const districts = (districtData?.rows || []).map((r: any) => ({ region: r.region, label: r.label, value: r.value, status: r.status, needs_review: r.status === "review" }));
  const alerts = data.alerts || {};

  const periodLabel = `${t("year")} 2026 · ${t("month_9")}`;
  // single-point trend -> big indicator, not a line chart
  const trendData = indTrend.map((p: any) => ({ name: `${t("month_1")}–${t("month_" + p.month)}`, value: p.value }));

  // top growth = highest index (excl. oblast); declining = only <100%
  const sorted = [...districts].sort((a: any, b: any) => (b.value || 0) - (a.value || 0));
  const top = sorted.filter((d: any) => d.region !== OBLAST).slice(0, 4);
  const bottom = sorted.filter((d: any) => d.region !== OBLAST && d.value < 100).reverse();

  return (
    <div className="space-y-6">
      <Hero lastUpdate={data.last_update} />

      {/* KPI row + summary */}
      <div>
        <SectionTitle icon={<Gauge className="w-4 h-4" aria-hidden />}>{t("main_indicators")}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard title={t("kpi_volume_short")} value={kc.volume?.value} unit={kc.volume?.unit}
            icon={<Factory className="w-5 h-5" aria-hidden />} status="verified" periodLabel={periodLabel}
            source={kc.volume?.source} spark={indTrend.map((p: any) => p.value).filter((v: any) => v != null)}
            change={kc.volume?.change ?? null} changeSuffix={""} tone="#1F5FE0"
            changeCaption={kc.volume?.prior_year ? `${t("vs_prior")} ${kc.volume.prior_year}` : (kc.volume?.yoy_reason === "no_current" ? t("yoy_no_current") : t("yoy_no_prior"))} />
          <KpiCard title={t("kpi_index_short")} value={kc.index?.value} unit={kc.index?.unit}
            icon={<TrendingUp className="w-5 h-5" aria-hidden />} status="verified" periodLabel={periodLabel}
            source={kc.index?.source} spark={indTrend.map((p: any) => p.value).filter((v: any) => v != null)}
            change={kc.index?.change ?? null} changeSuffix={" п.п."} tone="#1F5FE0"
            changeCaption={kc.index?.prior_year ? `${t("vs_prior")} ${kc.index.prior_year}` : (kc.index?.yoy_reason === "no_current" ? t("yoy_no_current") : t("yoy_no_prior"))} />
          <KpiCard title={t("kpi_mfg_output_short")} value={kc.mfg_output?.value} unit={kc.mfg_output?.unit}
            icon={<Cpu className="w-5 h-5" aria-hidden />} status="verified" periodLabel={periodLabel}
            source={kc.mfg_output?.source} spark={mfgTrend.map((p: any) => p.value).filter((v: any) => v != null)}
            change={kc.mfg_output?.change ?? null} changeSuffix={""} tone="#0EA5A4"
            changeCaption={kc.mfg_output?.prior_year ? `${t("vs_prior")} ${kc.mfg_output.prior_year}` : (kc.mfg_output?.yoy_reason === "no_current" ? t("yoy_no_current") : t("yoy_no_prior"))} />
          <KpiCard title={t("kpi_mfg_index_short")} value={kc.mfg_index?.value} unit={kc.mfg_index?.unit}
            icon={<Activity className="w-5 h-5" aria-hidden />} status="verified" periodLabel={periodLabel}
            source={kc.mfg_index?.source} spark={mfgTrend.map((p: any) => p.value).filter((v: any) => v != null)}
            change={kc.mfg_index?.change ?? null} changeSuffix={" п.п."} tone="#0EA5A4"
            changeCaption={kc.mfg_index?.prior_year ? `${t("vs_prior")} ${kc.mfg_index.prior_year}` : (kc.mfg_index?.yoy_reason === "no_current" ? t("yoy_no_current") : t("yoy_no_prior"))} />
          <SummaryPanel summaryLines={data.summary}
            topGrowth={data.top_growth}
            forecastAvailable={!!fc?.available}
            forecastNote={fc?.available ? `${t("model")}: ${fc.best_model}` : ""} />
        </div>
        {/* Data quality line (replaces the "districts with data" KPI card) */}
        <div className="flex flex-wrap items-center gap-4 mt-3 text-[13px] text-txt2">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#16A34A]"></span>
            {t("data_quality_line")}: {t("districts_with_data")}: <b className="text-[#0F2A4A]">{alerts.districts_with_data ?? 9}</b></span>
          {alerts.anomalies?.length > 0 && (
            <Link to="/alerts" className="flex items-center gap-1.5 text-[#D97706] hover:underline">
              ⚠ {t("alerts_anomalies")}: {alerts.anomalies.length}
            </Link>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card card-pad lg:col-span-2">
          <SectionTitle>{t("chart_ind_trend")}</SectionTitle>
          {indTrend.length > 1 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="#E5E9F0" strokeWidth={1} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748B" }} tickLine={false} axisLine={{ stroke: "#CBD5E1" }} />
                <YAxis tick={{ fontSize: 12, fill: "#64748B" }} tickLine={false} axisLine={{ stroke: "#CBD5E1" }} width={40} domain={["auto", "auto"]} />
                <Tooltip formatter={(v: any) => [num(v) + "%", t("actual")]} />
                <Line type="linear" dataKey="value" stroke="#1F5FE0" strokeWidth={2} dot={{ r: 3, fill: "#1F5FE0", stroke: "none" }} activeDot={{ r: 5, fill: "#1F5FE0", stroke: "none" }} isAnimationActive={true} animationDuration={600} />
              </LineChart>
            </ResponsiveContainer>
          ) : indTrend.length === 1 ? (
            /* single cumulative period -> 2026 vs 2025 mini comparison */
            <div className="py-2">
              <div className="text-xs text-txt2 mb-3">{t("period_cum_jan_sep_ru")}</div>
              <div className="flex items-end gap-6 px-2">
                {[{ y: 2026, v: indTrend[0].value, color: "#1F5FE0" },
                   { y: 2025, v: kc.index?.prev_value ?? null, color: "#94A3B8" }].map((b, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className="text-lg font-bold" style={{ color: b.color }}>{b.v != null ? num(b.v) : "—"}%</div>
                    <div className="w-14 rounded-t bg-current" style={{ height: Math.max(6, (b.v ?? 0) * 1.4), color: b.color, opacity: i === 0 ? 1 : 0.5 }} />
                    <div className="text-[11px] text-txt2">{b.y}</div>
                  </div>
                ))}
                {kc.index?.change != null && (
                  <div className="flex flex-col items-start justify-center pl-3 border-l border-[#E3E8F0]">
                    <div className="text-[11px] text-txt2">Δ vs 2025</div>
                    <div className="text-xl font-bold" style={{ color: (kc.index.change || 0) >= 0 ? "#16A34A" : "#DC2626" }}>
                      {(kc.index.change >= 0 ? "+" : "") + num(kc.index.change)} п.п.
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : <Empty text={t("empty_state")} />}
        </div>

        <div className="card card-pad">
          <SectionTitle>{t("chart_structure")}</SectionTitle>
          {structure.length ? (
            <SectorCards structure={structure} />
          ) : <Empty text={t("empty_state")} />}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* District ranking — divergent bars from 100% baseline */}
        <div className="card card-pad">
          <SectionTitle>{t("chart_districts")}</SectionTitle>
          {districts.length ? (
            <DistrictBars districts={districts} />
          ) : <Empty text={t("empty_state")} />}
        </div>

        {/* Key changes */}
        <div className="card card-pad">
          <SectionTitle>{t("key_changes")}</SectionTitle>
          <div className="space-y-4">
            <div>
              <div className="lbl mb-2">{t("key_changes_top")}</div>
              <div className="space-y-1.5">
                {top.map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">▲ {d.label}{d.needs_review && <span className="badge-warn" title={t("needs_review_flag")}>⚠</span>}</span>
                    <span className="num text-[#16A34A]">{num(d.value)}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="lbl mb-2">{t("key_changes_bottom")}</div>
              <div className="space-y-1.5">
                {bottom.length ? bottom.map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">▼ {d.label}{d.needs_review && <span className="badge-warn" title={t("needs_review_flag")}>⚠</span>}</span>
                    <span className="num text-[#DC2626]">{num(d.value)}%</span>
                  </div>
                )) : <div className="text-[13px] text-txt2">—</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
