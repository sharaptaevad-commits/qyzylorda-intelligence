import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { ErrorBox, Spinner, SectionTitle, Empty, fmtNum } from "../components/ui";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { useSettingFlag } from "../useSettingsFlag";

// canonical region keys (internal) — labels come from i18n (r_*), never raw RU
const REGIONS = ["Кызылординская область", "Кызылорда г.а", "Байконыр г.а", "Аральский",
  "Жалагашский", "Жанакорганский", "Казалинский", "Кармакшинский", "Сырдарьинский", "Шиелийский"];
const METRICS = ["industry_total", "mining", "processing", "utility", "water"];

const REGION_I18N: Record<string, string> = {
  "Кызылординская область": "r_oblast", "Кызылорда г.а": "r_kz_city", "Байконыр г.а": "r_baikonur",
  "Аральский": "r_aral", "Жалагашский": "r_zhalagash", "Жанакорганский": "r_janakorgan",
  "Казалинский": "r_kazaly", "Кармакшинский": "r_karmakshi", "Сырдарьинский": "r_syrdarya", "Шиелийский": "r_shieli",
};
const METRIC_I18N: Record<string, string> = {
  industry_total: "m_industry_total", mining: "m_mining", processing: "m_processing",
  utility: "m_utility", water: "m_water",
};
// unit is automatic per metric type: index -> %, volume -> млрд тг
const METRIC_UNIT: Record<string, "pct" | "vol"> = {
  industry_total: "pct", mining: "pct", processing: "pct", utility: "pct", water: "vol",
};
const HORIZONS = [1, 3, 6, 12];

export default function Forecast() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const { enabled: forecastEnabled, loading: flagLoading } = useSettingFlag("forecast_enabled");
  const [metric, setMetric] = useState("industry_total");
  const [region, setRegion] = useState("Кызылординская область");
  const [horizon, setHorizon] = useState(6);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [avail, setAvail] = useState<any>(null);

  const unit = METRIC_UNIT[metric] === "vol" ? "тыс. теңге" : "%";
  const unitKey = METRIC_UNIT[metric] === "vol" ? "unit_blnt" : "unit_pct";

  const rLabel = (r: string) => t(REGION_I18N[r] || "region");
  const mLabel = (m: string) => t(METRIC_I18N[m] || "metric");

  // data status: how many months available for the chosen metric+region,
  // whether a forecast is possible, and which horizons are valid.
  const loadAvail = useCallback(() => {
    api.forecastAvailability({ metric, region, unit, lang })
      .then(setAvail).catch(() => setAvail(null));
  }, [metric, region, unit, lang]);
  useEffect(() => { loadAvail(); }, [loadAvail]);

  const possible = !!avail?.possible;
  const disabled = busy || !possible;
  const months = avail?.months_available ?? 0;
  const need = avail?.required_months ?? 24;

  // regions that actually have data for this metric (avoid empty combos)
  const regionOptions = useMemo(() => {
    if (!avail) return REGIONS;
    // avail only reports for the current region; keep the list, but flag current
    return REGIONS;
  }, [avail]);

  async function go() {
    setBusy(true); setErr(null);
    try { setRun(await api.forecast({ metric, region, unit, horizon, lang })); }
    catch (e: any) { setErr(e); } finally { setBusy(false); }
  }

  const modelNames = Object.keys(run?.metrics || {});
  let chartData: any[] = [];
  if (run?.available) {
    chartData = (run.history || []).map((h: any) => ({ label: h.label || String(h.month), hist: h.value, fc: null }));
    (run.forecast || []).forEach((f: any) => chartData.push({ label: f.label || String(f.month), hist: null, fc: f.value }));
  }
  const last = (arr: any[]) => arr && arr.length ? arr[arr.length - 1] : null;

  // forecasting module is feature-flagged (default off). When off, the page shows
  // a clear "disabled" state and never runs a forecast.
  if (flagLoading) return <Spinner />;
  if (!forecastEnabled) {
    return (
      <div className="card card-pad">
        <SectionTitle>{t("nav_forecasts")}</SectionTitle>
        <Empty text={t("forecast_disabled")} />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div className="card card-pad">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <SectionTitle>{t("forecast_title")}</SectionTitle>
            <p className="text-sm text-surface-500 mt-1">{t("fc_desc")}</p>
          </div>
          <span className="text-xs text-surface-400 border border-surface-200 rounded-full px-2.5 py-1 whitespace-nowrap">
            {t(unitKey)}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Field label={t("metric")}>
            <select className="f-input" value={metric} onChange={(e) => setMetric(e.target.value)}>
              {METRICS.map((m) => <option key={m} value={m}>{mLabel(m)}</option>)}
            </select>
          </Field>
          <Field label={t("region")}>
            <select className="f-input" value={region} onChange={(e) => setRegion(e.target.value)}>
              {regionOptions.map((r) => <option key={r} value={r}>{rLabel(r)}</option>)}
            </select>
          </Field>
          <Field label={t("horizon")}>
            <select className="f-input" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
              {HORIZONS.map((h) => (
                <option key={h} value={h} disabled={avail && !(avail.horizons || []).find((x: any) => x.h === h)?.ok}>
                  {t(`h_${h}`)}{avail && !(avail.horizons || []).find((x: any) => x.h === h)?.ok ? ` — ${t("fc_horizon_disabled")}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <button onClick={go} disabled={disabled}
              className="w-full h-10 px-4 rounded-lg font-semibold bg-brand text-white hover:bg-brand-700 disabled:bg-surface-300 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2">
              {busy ? <Spinner /> : t("generate_forecast")}
            </button>
          </div>
        </div>

        {/* data status strip — shown before running */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="text-surface-500">{t("fc_hist_status", { n: months })}</span>
          <span className={possible ? "text-emerald-600" : "text-rose-600"}>
            {t("fc_forecast_status", { s: possible ? t("fc_possible") : t("fc_impossible") })}
          </span>
          {!possible && (
            <span className="text-rose-600">{t("fc_need_months", { have: months, need })}</span>
          )}
        </div>
        <p className="mt-3 text-xs text-surface-400">{t("fc_note")}</p>
      </div>

      {err && <ErrorBox error={err} />}
      {busy && !run && <div className="card card-pad"><Spinner /></div>}

      {run && (
        <>
          {!run.available ? (
            <div className="card card-pad">
              <SectionTitle>{t("forecast_unavailable")}</SectionTitle>
              <p className="text-sm text-surface-600 mt-2">{run.explanation === "insufficient_data" ? t("insufficient_data") : run.explanation}</p>
              {run.error && <p className="text-xs text-surface-400 mt-1">{run.error}</p>}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {modelNames.map((name) => {
                  const m = run.metrics[name]; const p = last(m?.pred);
                  return (
                    <div key={name} className="card card-pad">
                      <div className="text-xs text-surface-500">{t("model")}: {name}</div>
                      <div className="text-2xl font-bold tabular-nums text-brand mt-1">{p != null ? fmtNum(p) : "—"}</div>
                      <div className="text-xs text-surface-400 mt-0.5">{t("pred_interval")} ±{fmtNum(m?.rmse || 0)}</div>
                    </div>
                  );
                })}
              </div>

              <div className="card card-pad">
                <SectionTitle>{t("forecast_title")} — {run.metric_label}</SectionTitle>
                <div className="text-xs text-surface-400 mb-3">{t("explanation")}: {run.explanation}</div>
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="hist" name={t("actual")} stroke="#1F5FE0" strokeWidth={2} connectNulls />
                      <Line type="monotone" dataKey="fc" name={t("forecast")} stroke="#D97706" strokeWidth={2} strokeDasharray="5 4" dot connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <Empty text={t("empty_state")} />}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-surface-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
