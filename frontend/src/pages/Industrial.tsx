import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { ErrorBox, useFmt, Spinner } from "../components/ui";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, BarChart, Bar, Cell,
} from "recharts";
import { Factory, Layers } from "lucide-react";

const REGION = "Кызылординская область";
const SECTOR_COLORS = ["#1F5FE0", "#0EA5A4", "#F59E0B", "#64748B"];
const SECTOR_KEYS = ["mining", "processing", "utility", "water"];
const YEAR = 2026;

// URL unit param
function getUnitFromUrl(): string {
  const h = window.location.hash || "";
  const q = h.includes("?") ? h.split("?")[1] : "";
  const p = new URLSearchParams(q);
  return p.get("unit") || "index";
}
function setUnitInUrl(u: string) {
  const h = window.location.hash || "#/";
  const path = h.includes("?") ? h.split("?")[0] : h;
  const q = new URLSearchParams(h.includes("?") ? h.split("?")[1] : "");
  q.set("unit", u);
  window.history.replaceState(null, "", path + "?" + q.toString());
}

type UnitMode = "index" | "volume";

export default function Industrial() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const { num } = useFmt();
  const [unit, setUnitState] = useState<UnitMode>(() => (getUnitFromUrl() as UnitMode) || "index");
  const [data, setData] = useState<any>(null);
  const [dyn, setDyn] = useState<any>(null);
  const [volDyn, setVolDyn] = useState<any>(null);
  const [err, setErr] = useState<any>(null);

  const setUnit = useCallback((u: UnitMode) => {
    setUnitState(u);
    setUnitInUrl(u);
  }, []);
  const setUnitStr = useCallback((v: string) => setUnit(v as UnitMode), [setUnit]);

  useEffect(() => {
    setErr(null);
    api.industries({ region: REGION, lang }).then(setData).catch(setErr);
  }, [lang]);

  // load dynamics when data or unit changes
  useEffect(() => {
    if (!data) return;
    const isVol = unit === "volume";
    const p = isVol
      ? api.volumeDynamics({ metric: "industry_total", region: REGION, year: String(YEAR), compare_year: String(YEAR - 1), unit: "тыс. теңге", lang })
      : api.indexDynamics({ metric: "industry_total", region: REGION, year: String(YEAR), compare_year: String(YEAR - 1), unit: "%", lang });
    p.then(setDyn).catch(() => setDyn(null));
  }, [data, unit, lang]);

  // chart data (must be before any early return — hooks rule)
  const chartData = useMemo(() => {
    const series = dyn?.series || [];
    return series.map((s: any) => ({
      name: s.label,
      cur: s.value,
      cmp: s.compare,
      delta: s.delta,
    }));
  }, [dyn]);

  if (err) return <ErrorBox error={err} />;
  if (!data || !dyn) return <Spinner />;

  const sectors: any[] = data.sectors || [];
  const byKey = Object.fromEntries(sectors.map((s: any) => [s.key, s]));
  const total = byKey["industry_total"];
  const isVol = unit === "volume";
  const hasMultiplePoints = chartData.filter((d: any) => d.cur != null).length >= 2;

  return (
    <div className="space-y-5">
      {/* Top bar: segmented unit toggle */}
      <div className="card card-pad flex flex-wrap items-center gap-3">
        <SegmentedToggle
          value={unit}
          onChange={setUnitStr}
          options={[
            { key: "index", label: t("unit_seg_index") },
            { key: "volume", label: t("unit_seg_volume"), disabled: !total?.volume?.last },
          ]}
          disabledReason={t("unit_vol_disabled")}
        />
        <div className="flex-1"></div>
        <span className="text-xs text-surface-400">{t("cum_period_2026")}</span>
      </div>

      {/* TOTAL card */}
      <div className="card card-pad">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-base font-semibold text-[#0F2A4A] flex items-center gap-2">
              <Factory className="w-4 h-4 text-brand" aria-hidden />
              {t("ind_total_title")}
            </div>
            <div className="text-xs text-surface-400 mt-0.5">{t("cum_period_2026")}</div>
          </div>
          <StatusBadge />
        </div>

        {/* Big number */}
        <div className="mb-4">
          <span className="text-4xl font-bold text-[#0F2A4A] tabular-nums">
            {isVol
              ? (total?.volume?.last != null ? formatVolume(total.volume.last, t) : "—")
              : (total?.index?.last != null ? num(total.index.last) : "—")}
          </span>
          <span className="text-sm font-medium text-surface-400 ml-2">
            {isVol ? "₸" : "%"}
          </span>
        </div>

        {/* Comparison line — the delta is a site-calculated (reference) value, not official */}
        <div className="mb-5 text-sm">
          {total?.index?.compare != null ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-surface-500">{t("vs_prior_same_period")}:</span>
              <span className="font-medium tabular-nums">{num(total.index.compare)}%</span>
              {total.index.delta != null && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${total.index.delta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                  {total.index.delta >= 0 ? "▲ +" : "▼ −"}{num(Math.abs(total.index.delta))} п.п.
                </span>
              )}
              <RefBadge />
            </div>
          ) : (
            <div className="text-surface-400">{t("no_compare_period")}</div>
          )}
        </div>

        {/* Chart */}
        {hasMultiplePoints ? (
          <div style={{ height: 320 }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTip isVol={isVol} num={num} t={t} />} />
                <ReferenceLine y={100} stroke="#94A3B8" strokeDasharray="4 4" label={{ value: "100%", position: "insideTopRight", fontSize: 10, fill: "#94A3B8" }} />
                <Line type="monotone" dataKey="cur" name={String(YEAR)} stroke="#1F5FE0" strokeWidth={2.5} dot={{ r: 4, fill: "#1F5FE0" }} animationDuration={600} connectNulls={false} />
                <Line type="monotone" dataKey="cmp" name={`${YEAR - 1} (${t("legend_cmp_period")})`} stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="6 3" dot={false} animationDuration={600} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          /* Single point: bar chart */
          <div>
            <BarChart data={[{ name: t("cum_period_2026"), cur: total?.index?.last, cmp: total?.index?.compare }]} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
              <Tooltip content={<BarTip isVol={isVol} num={num} t={t} />} />
              <ReferenceLine y={100} stroke="#94A3B8" strokeDasharray="4 4" />
              <Bar dataKey="cur" name={String(YEAR)} fill="#1F5FE0" radius={[4, 4, 0, 0]} />
              <Bar dataKey="cmp" name={`${YEAR - 1}`} fill="#CBD5E1" radius={[4, 4, 0, 0]} />
            </BarChart>
            <p className="text-xs text-surface-400 mt-2">{t("need_min_2_periods")}</p>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#1F5FE0] inline-block rounded" /> {YEAR}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#94A3B8] inline-block rounded border-b border-dashed" /> {YEAR - 1} ({t("legend_cmp_period")})</span>
        </div>

        {/* Source note */}
        <p className="text-[11px] text-surface-400 mt-4">
          {total?.source ? `${t("cumulative_note")}. ${total.source}${total?.period ? ` (${total.period})` : ""}.` : t("cumulative_note")}.
        </p>
      </div>

      {/* 4 SECTORS */}
      <div>
        <div className="text-base font-semibold text-[#0F2A4A] flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-brand" aria-hidden />
          {t("sectors_title")}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {SECTOR_KEYS.map((k, i) => {
            const s = byKey[k];
            if (!s) return null;
            return (
              <div key={k} className="card card-pad">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm" style={{ background: SECTOR_COLORS[i] }} />
                    <span className="font-semibold text-[#0F2A4A]">{s.label || s.short}</span>
                  </div>
                  <span className="text-xl font-bold text-[#0F2A4A] tabular-nums">
                    {isVol
                      ? (s.volume?.last != null ? formatVolume(s.volume.last, t) : "—")
                      : (s.index?.last != null ? num(s.index.last) : "—")}
                    <span className="text-xs font-medium text-surface-400 ml-1">{isVol ? "₸" : "%"}</span>
                  </span>
                </div>
                <SectorMiniChart metric={k} region={REGION} year={YEAR} compareYear={YEAR - 1} tone={SECTOR_COLORS[i]} isVol={isVol} num={num} t={t} lang={lang} />
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-surface-400 mt-3">
          {isVol ? t("volume_derived_note") : t("cumulative_note")}
        </p>
      </div>
    </div>
  );
}

/* ---------- Segmented Toggle ---------- */
function SegmentedToggle({ value, onChange, options, disabledReason }: {
  value: string; onChange: (v: string) => void;
  options: { key: string; label: string; disabled?: boolean }[];
  disabledReason?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const idx = options.findIndex(o => o.key === value);
    const dir = e.key === "ArrowRight" ? 1 : -1;
    let next = idx;
    for (let i = 0; i < options.length; i++) {
      next = (next + dir + options.length) % options.length;
      if (!options[next].disabled) break;
    }
    onChange(options[next].key);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label="Unit" className="inline-flex rounded-lg border border-surface-200 overflow-hidden" onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const active = value === o.key;
        const disabled = o.disabled;
        return (
          <button
            key={o.key}
            ref={el => { refs.current[i] = el; }}
            role="tab"
            aria-selected={active}
            aria-pressed={active}
            disabled={disabled}
            title={disabled ? disabledReason : undefined}
            onClick={() => !disabled && onChange(o.key)}
            className={`px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 ${
              active ? "bg-brand text-white" : "bg-white text-surface-600 hover:bg-surface-50"
            } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
            style={{ height: 40 }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Status badge (official value) ---------- */
function StatusBadge() {
  const { t } = useTranslation();
  return (
    <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
      {t("badge_official")}
    </span>
  );
}

/* ---------- Reference (site-calculated) badge ---------- */
function RefBadge() {
  const { t } = useTranslation();
  return (
    <span title={t("badge_reference_tip")} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-100 text-surface-500 border border-surface-200 cursor-help">
      {t("badge_reference")}
    </span>
  );
}

/* ---------- Sector mini chart ---------- */
function SectorMiniChart({ metric, region, year, compareYear, tone, isVol, num, t, lang }: any) {
  const [series, setSeries] = useState<any[]>([]);
  useEffect(() => {
    const p = isVol
      ? api.volumeDynamics({ metric, region, year: String(year), compare_year: String(compareYear), unit: "тыс. теңге", lang })
      : api.indexDynamics({ metric, region, year: String(year), compare_year: String(compareYear), unit: "%", lang });
    p.then((d: any) => setSeries(d?.series || [])).catch(() => setSeries([]));
  }, [metric, isVol, lang]);

  const data = series.map((s: any) => ({ name: s.label, cur: s.value, cmp: s.compare }));
  const hasPoints = data.filter((d: any) => d.cur != null).length >= 2;

  if (!series.length) return <div className="h-40 flex items-center justify-center text-xs text-surface-400">—</div>;

  if (!hasPoints) return (
    <div className="h-40 flex items-center justify-center text-xs text-surface-400">{t("need_min_2_periods")}</div>
  );

  return (
    <div style={{ height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} width={40} />
          <Tooltip content={<MiniTip isVol={isVol} num={num} t={t} />} />
          <ReferenceLine y={100} stroke="#CBD5E1" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="cur" stroke={tone} strokeWidth={2} dot={{ r: 3, fill: tone }} animationDuration={400} connectNulls={false} />
          <Line type="monotone" dataKey="cmp" stroke="#CBD5E1" strokeWidth={1} strokeDasharray="4 2" dot={false} animationDuration={400} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Volume formatting ---------- */
function formatVolume(v: number, t: any): string {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + " " + t("unit_bln_short");
  if (v >= 1e6) return (v / 1e6).toFixed(1) + " " + t("unit_mln_short");
  return v.toLocaleString();
}

/* ---------- Tooltips ---------- */
function CustomTip({ active, payload, label, isVol, num, t }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  const unitLabel = isVol ? "₸" : "%";
  return (
    <div className="card card-pad !p-2 text-[11px] leading-relaxed">
      <div className="font-semibold text-[#0F2A4A] mb-0.5">{label} {String(2026)}</div>
      {p.cur != null && <div>{t("legend_current_year")}: {isVol ? formatVolume(p.cur, t) : num(p.cur) + unitLabel}</div>}
      {p.cmp != null && <div>{t("legend_compare_year")}: {isVol ? formatVolume(p.cmp, t) : num(p.cmp) + unitLabel}</div>}
      {p.delta != null && (
        <div style={{ color: p.delta >= 0 ? "#16A34A" : "#DC2626" }}>
          {t("cmp_delta")}: {p.delta >= 0 ? "▲ +" : "▼ −"}{num(Math.abs(p.delta))} {isVol ? "" : "п.п."}
        </div>
      )}
    </div>
  );
}

function BarTip({ active, payload, label, isVol, num, t }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card card-pad !p-2 text-[11px]">
      {payload.map((p: any, i: number) => (
        <div key={i}>{p.name}: {p.value != null ? (isVol ? formatVolume(p.value, t) : num(p.value) + "%") : "—"}</div>
      ))}
    </div>
  );
}

function MiniTip({ active, payload, label, isVol, num, t }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="card card-pad !p-1.5 text-[10px]">
      <div className="font-semibold">{label}</div>
      {p.cur != null && <div>{num(p.cur)}{isVol ? " ₸" : "%"}</div>}
      {p.cmp != null && <div className="text-surface-400">{t("legend_cmp_period")}: {num(p.cmp)}{isVol ? " ₸" : "%"}</div>}
    </div>
  );
}
