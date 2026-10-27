import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { api, download, getUser, BASE } from "../api";
import { SectionTitle, Empty, ErrorBox, Spinner } from "../components/ui";

const REGIONS = ["Кызылординская область", "Кызылорда г.а", "Байконыр г.а", "Аральский",
  "Жалагашский", "Жанакорганский", "Казалинский", "Кармакшинский", "Сырдарьинский", "Шиелийский"];
const REGION_I18N: Record<string, string> = {
  "Кызылординская область": "r_oblast", "Кызылорда г.а": "r_kz_city", "Байконыр г.а": "r_baikonur",
  "Аральский": "r_aral", "Жалагашский": "r_zhalagash", "Жанакорганский": "r_janakorgan",
  "Казалинский": "r_kazaly", "Кармакшинский": "r_karmakshi", "Сырдарьинский": "r_syrdarya", "Шиелийский": "r_shieli",
};
const METRIC_I18N: Record<string, string> = {
  industry_total: "m_industry_total", processing: "m_processing",
};
// unit auto by metric type
const METRIC_UNIT: Record<string, { unit: string; key: string }> = {
  industry_total: { unit: "%", key: "unit_pct" },
  processing: { unit: "%", key: "unit_pct" },
};

interface ReportType {
  key: string; metric: string; descKey: string; category: "official" | "calculated" | "forecast";
  hidden?: boolean;
}
const TYPES: ReportType[] = [
  { key: "report_industrial", metric: "industry_total", descKey: "rep_industrial_desc", category: "official" },
  { key: "report_mfg", metric: "processing", descKey: "rep_mfg_desc", category: "official" },
  { key: "report_district", metric: "interface", descKey: "rep_district_desc", category: "calculated" },
  { key: "report_quality", metric: "industry_total", descKey: "rep_quality_desc", category: "calculated" },
  { key: "report_forecast", metric: "industry_total", descKey: "rep_forecast_desc", category: "forecast", hidden: true },
];

export default function Reports() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const [rptLang, setRptLang] = useState(lang);
  const [region, setRegion] = useState("Кызылординская область");
  const [period, setPeriod] = useState("9");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [previewErr, setPreviewErr] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [fcEnabled, setFcEnabled] = useState(false);
  const user = getUser();
  const isAdmin = user?.role === "admin";

  useEffect(() => { api.reportsConfig().then((c: any) => setFcEnabled(!!c.forecast_report_enabled)).catch(() => {}); }, []);
  const toggleForecast = async () => {
    const next = !fcEnabled;
    setFcEnabled(next);
    try { await api.putReportsConfig({ forecast_report_enabled: next }); }
    catch (e: any) { setFcEnabled(!next); setPreviewErr(e); }
  };

  // metric label / unit auto
  const mLabel = (m: string) => t(METRIC_I18N[m] || "metric");
  const rLabel = (r: string) => t(REGION_I18N[r] || "region");
  const unitKey = (m: string) => (METRIC_UNIT[m]?.key || "unit_pct");

  // forecast report hidden unless the server-side feature flag is on (admin toggles it)
  const visibleTypes = TYPES.filter(tp => tp.key !== "report_forecast" || fcEnabled);

  // last available period label
  const periodLabel = useMemo(() => t(`month_${period}`), [period, t]);

  const doExport = (tp: ReportType, kind: "pdf" | "xlsx") => {
    setBusyKey(tp.key + kind);
    download(api.platformExport(kind, { metric: tp.metric, unit: METRIC_UNIT[tp.metric]?.unit || "%", region, lang: rptLang, period: String(period) }));
    setBusyKey(null);
    // refresh history (report just generated)
    api.reportHistory().then((r: any) => setHistory(r.history || [])).catch(() => {});
  };

  const doPreview = async (tp: ReportType) => {
    setPreviewErr(null); setBusyKey(tp.key + "preview");
    try {
      const res = await api.industrial({ metric: tp.metric, unit: METRIC_UNIT[tp.metric]?.unit || "%", region, lang: rptLang });
      if (!res?.cumulative?.length) {
        setPreviewErr({ message: t("rep_no_records") });
        return;
      }
      setPreview({ tp, res });
    } catch (e: any) { setPreviewErr(e); }
    setBusyKey(null);
  };

  // report history (actual generated reports only — not audit/config events)
  useEffect(() => { api.reportHistory().then((r: any) => setHistory(r.history || [])).catch(() => {}); }, []);

  return (
    <div className="space-y-5">
      {/* filter card */}
      <div className="card card-pad">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <SectionTitle>{t("reports_title")}</SectionTitle>
            <p className="text-sm text-surface-500 mt-1">{t("rep_desc")}</p>
          </div>
          <span className="text-xs text-surface-400 border border-surface-200 rounded-full px-2.5 py-1 whitespace-nowrap">
            {t(unitKey("industry_total"))}
          </span>
          {isAdmin && (
            <label className="flex items-center gap-2 text-xs text-surface-600 cursor-pointer" title={t("rep_forecast_hidden")}>
              <input type="checkbox" checked={fcEnabled} onChange={toggleForecast} />
              {t("rep_forecast_toggle")}
            </label>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label={t("report_lang")}>
            <select className="f-input" value={rptLang} onChange={e => setRptLang(e.target.value)}>
              <option value="kk">KK</option><option value="ru">RU</option><option value="en">EN</option>
            </select>
          </Field>
          <Field label={t("region")}>
            <select className="f-input" value={region} onChange={e => setRegion(e.target.value)}>
              {REGIONS.map(r => <option key={r} value={r}>{rLabel(r)}</option>)}
            </select>
          </Field>
          <Field label={t("period")}>
            <select className="f-input" value={period} onChange={e => setPeriod(e.target.value)}>
              {[9, 6, 3, 1].map(m => <option key={m} value={m}>{t(`month_${m}`)} {t("cumulative_jan_to").replace("{m}", t(`month_${m}`))}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* report type cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleTypes.map(tp => {
          const noData = false; // data presence revealed in preview
          return (
            <div key={tp.key} className="card card-pad flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{t(tp.key)}</div>
                  <div className="text-xs text-surface-500 mt-0.5">{t(tp.descKey)}</div>
                </div>
                {tp.category === "forecast" && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#D97706" }}>
                    {t("rep_forecast_official")}
                  </span>
                )}
              </div>

              <div className="text-xs text-surface-500 mt-3 flex flex-wrap gap-x-3 gap-y-1">
                <span>{rLabel(region)} · {t("rep_period_full", { year: 2026, period: t("cumulative_jan_to").replace("{m}", t(`month_${period}`)) })}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <CatBadge cat={tp.category} t={t} />
              </div>

              <div className="mt-4 pt-3 border-t border-surface-100 flex flex-wrap gap-2 items-center">
                <button onClick={() => doPreview(tp)} disabled={busyKey === tp.key + "preview"}
                  className="f-btn f-btn-ghost">{busyKey === tp.key + "preview" ? <Spinner /> : t("rep_preview")}</button>
                <button onClick={() => doExport(tp, "pdf")} disabled={noData || busyKey === tp.key + "pdf"}
                  className="f-btn f-btn-primary">{t("report_pdf")}</button>
                <button onClick={() => doExport(tp, "xlsx")} disabled={noData || busyKey === tp.key + "xlsx"}
                  className="f-btn f-btn-ghost">{t("report_xlsx")}</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* history */}
      <div className="card card-pad">
        <SectionTitle>{t("rep_history")}</SectionTitle>
        {history.length ? (
          <HistoryTable history={history} t={t} lang={lang} />
        ) : (
          <Empty text={t("rep_history_empty")} />
        )}
      </div>

      {/* preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-black/40" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-xl max-w-3xl w-full mt-10" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-surface-100 flex items-center justify-between">
              <div className="text-sm font-semibold">{t(preview.tp.key)} — {preview.res.region_label}</div>
              <button onClick={() => setPreview(null)} className="text-surface-400 hover:text-surface-600">✕</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <CatBadge cat={preview.tp.category} t={t} />
                <span className="text-surface-400">{t("rep_generated")}: {new Date().toLocaleString()}</span>
                <span className="text-surface-400">{t("rep_by")}: {user?.username || "—"}</span>
              </div>
              <table className="tbl">
                <thead><tr><th>{t("al_period")}</th><th className="text-right">{t("al_value")}</th><th>{t("al_source_file")}</th></tr></thead>
                <tbody>
                  {(preview.res.cumulative || []).map((p: any, i: number) => (
                    <tr key={i}><td>{p.label}</td><td className="num">{p.value?.toFixed(1) ?? "—"}</td><td className="text-xs text-surface-500">{p.source}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-surface-400">{t("rep_based_on")}</p>
              <div className="flex gap-2 pt-2">
                <button onClick={() => doExport(preview.tp, "pdf")} className="f-btn f-btn-primary">{t("report_pdf")}</button>
                <button onClick={() => doExport(preview.tp, "xlsx")} className="f-btn f-btn-ghost">{t("report_xlsx")}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {previewErr && (
        <div className="card card-pad">
          <ErrorBox error={previewErr} />
          <button onClick={() => setPreviewErr(null)} className="f-btn f-btn-ghost mt-2">{t("rep_retry")}</button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<label className="block"><span className="block text-xs font-medium text-surface-500 mb-1">{label}</span>{children}</label>);
}

function CatBadge({ cat, t }: { cat: "official" | "calculated" | "forecast"; t: (k: string) => string }) {
  const map = {
    official: ["#E7F6EC", "#16A34A", "rep_official"],
    calculated: ["#E7F0FE", "#1F5FE0", "rep_official_plus_calc"],
    forecast: ["#FEF3C7", "#D97706", "rep_forecast_official"],
  } as const;
  const [bg, fg, key] = map[cat];
  return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: bg, color: fg }}>{t(key)}</span>;
}

// Report history table: filters (period, type), search, pagination, empty state.
// Only ACTUAL generated reports (from report_history), never audit/config events.
function HistoryTable({ history, t, lang }: { history: any[]; t: (k: string) => string; lang: string }) {
  const [search, setSearch] = useState("");
  const [fPeriod, setFPeriod] = useState("all");
  const [fType, setFType] = useState("all");
  const [page, setPage] = useState(0);
  const PER_PAGE = 10;

  const periods = useMemo(() => Array.from(new Set(history.map((h) => h.period).filter(Boolean))), [history]);
  const types = useMemo(() => Array.from(new Set(history.map((h) => h.metric).filter(Boolean))), [history]);

  const filtered = useMemo(() => {
    let rows = history;
    if (fPeriod !== "all") rows = rows.filter((h) => h.period === fPeriod);
    if (fType !== "all") rows = rows.filter((h) => h.metric === fType);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((h) =>
        (h.region || "").toLowerCase().includes(q) ||
        (h.metric_label || "").toLowerCase().includes(q) ||
        (h.by || "").toLowerCase().includes(q) ||
        (h.format || "").toLowerCase().includes(q));
    }
    return [...rows].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }, [history, fPeriod, fType, search]);

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageRows = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  useEffect(() => { setPage(0); }, [fPeriod, fType, search]);

  if (!filtered.length) return <Empty text={t("rep_history_empty")} />;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <label className="block">
          <span className="block text-xs font-medium text-surface-500 mb-1">{t("rep_h_period")}</span>
          <select className="f-input" value={fPeriod} onChange={(e) => setFPeriod(e.target.value)}>
            <option value="all">{t("al_sev_all")}</option>
            {periods.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-surface-500 mb-1">{t("rep_h_type")}</span>
          <select className="f-input" value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="all">{t("al_sev_all")}</option>
            {types.map((m) => <option key={m} value={m}>{t("rep_cat_" + m) || m}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-surface-500 mb-1">{t("al_search_region")}</span>
          <input className="f-input" style={{ minWidth: 150 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("al_search_region")} />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr>
            <th>{t("rep_h_date")}</th><th>{t("rep_h_type")}</th><th>{t("rep_h_period")}</th>
            <th>{t("region")}</th><th>{t("rep_h_lang")}</th><th>{t("rep_h_format")}</th><th>{t("rep_h_by")}</th><th>{t("rep_h_download")}</th>
          </tr></thead>
          <tbody>
            {pageRows.map((h, i) => (
              <tr key={i} className="hover:bg-[#F8FAFD]">
                <td className="text-xs tabular-nums whitespace-nowrap">{h.ts ? new Date(h.ts * 1000).toLocaleString(lang) : "—"}</td>
                <td>{t("rep_cat_" + h.metric) || h.metric_label || h.metric}</td>
                <td className="text-xs">{h.period || "—"}</td>
                <td className="text-xs">{h.region || "—"}</td>
                <td className="text-xs uppercase">{h.lang || "—"}</td>
                <td className="text-xs">{(h.format || "").toUpperCase()}</td>
                <td className="text-xs">{h.by || "—"}</td>
                <td className="text-xs">
                  {h.file ? (
                    <a href={`${BASE}/reports/file?file=${encodeURIComponent(h.file)}`}
                      className="text-[#1F5FE0] hover:text-[#0B3FA8] font-semibold">{t("rep_h_download")}</a>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-3 text-xs">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}
            className="px-2 py-1 rounded bg-surface-50 hover:bg-surface-100 disabled:opacity-40">←</button>
          <span>{page + 1} / {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)}
            className="px-2 py-1 rounded bg-surface-50 hover:bg-surface-100 disabled:opacity-40">→</button>
        </div>
      )}
    </div>
  );
}
