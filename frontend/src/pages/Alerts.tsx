import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { Spinner, ErrorBox, SectionTitle, Empty } from "../components/ui";
import { Bell, AlertTriangle, Database, CheckCircle2, ArrowDown, Info, Search } from "lucide-react";

// Cumulative months that may have data (max observed = 9; include common + historical)
const PERIOD_MONTHS = [9, 8, 7, 6, 5, 4, 3, 2, 1];
// Threshold multipliers (×mean / std-dev based rule)
const THRESHOLDS = [1.5, 2.0, 3.0];
const METRICS = ["industry_total", "mining", "processing", "utility", "water"];

export default function Alerts() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const [period, setPeriod] = useState(9);
  const [threshold, setThreshold] = useState(2.0);
  const [data, setData] = useState<any>(null);
  const [decisions, setDecisions] = useState<Record<string, any>>({});
  const [err, setErr] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // filters
  const [search, setSearch] = useState("");
  const [fMetric, setFMetric] = useState("all");
  const [fSev, setFSev] = useState("all");
  const [sortKey, setSortKey] = useState<string>("deviation");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // modals
  const [fixFor, setFixFor] = useState<any>(null);
  const [noteFor, setNoteFor] = useState<any>(null);
  const [fixType, setFixType] = useState("");
  const [fixNote, setFixNote] = useState("");
  const [noteText, setNoteText] = useState("");
  const [toast, setToast] = useState<string>("");
  // AI analysis modal
  const [aiFor, setAiFor] = useState<any>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const anomsRef = React.useRef<HTMLDivElement>(null);
  const missRef = React.useRef<HTMLDivElement>(null);

  const keyOf = (a: any) => `${a.metric}|${a.region}|${a.period_month}`;
  const num = (v: any) => (v == null ? "—" : Number(v).toFixed(1));

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    api.alertsDetailed({ period_month: String(period), threshold: String(threshold), lang })
      .then((d: any) => { setData(d); }).catch((e) => { setErr(e); setData(null); })
      .finally(() => setLoading(false));
    api.anomalyDecisions().then(setDecisions).catch(() => {});
  }, [period, threshold, lang]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  // ---- derived anomalies (apply decision status) ----
  const anomalies = useMemo(() => {
    if (!data) return [];
    return (data.anomalies || []).map((a: any) => {
      const d = decisions[keyOf(a)];
      return { ...a, status: d?.status || a.status };
    });
  }, [data, decisions]);

  // ---- filter + sort ----
  const filtered = useMemo(() => {
    let rows: any[] = anomalies;
    if (fMetric !== "all") rows = rows.filter((a: any) => a.metric === fMetric);
    if (fSev !== "all") rows = rows.filter((a: any) => a.severity === fSev);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((a: any) => (a.label || "").toLowerCase().includes(q) || (a.region || "").toLowerCase().includes(q));
    }
    const dir = sortDir === "asc" ? 1 : -1;
    rows = [...rows].sort((x: any, y: any) => {
      const xv = x[sortKey] ?? -Infinity, yv = y[sortKey] ?? -Infinity;
      if (xv === yv) return 0;
      return (xv > yv ? 1 : -1) * dir;
    });
    return rows;
  }, [anomalies, fMetric, fSev, search, sortKey, sortDir]);

  const missing = data?.missing || [];

  const scrollTo = (ref: React.RefObject<HTMLDivElement>) =>
    ref?.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  // ---- actions (persisted via backend) ----
  const saveDecision = async (a: any, action: string, extra?: any) => {
    try {
      await api.anomalyDecision({ metric: a.metric, region: a.region, period_month: a.period_month, action, ...(extra || {}) });
      setToast(t("al_save_ok"));
      load();
      return true;
    } catch (e: any) {
      setToast(t("al_save_err"));
      return false;
    }
  };

  const confirmFix = async () => {
    if (!fixFor) return;
    const ok = await saveDecision(fixFor, "send_fix", { note: `${fixType} ${fixNote}`.trim() });
    if (ok) { setFixFor(null); setFixType(""); setFixNote(""); }
  };
  const confirmNote = async () => {
    if (!noteFor) return;
    const ok = await saveDecision(noteFor, "note", { note: noteText });
    if (ok) { setNoteFor(null); setNoteText(""); }
  };

  // Send an anomaly to the AI analyst for explanation (factual data only).
  const askAI = async (a: any) => {
    setAiFor(a);
    setAiLoading(true);
    setAiResult(null);
    const q = t("al_ai_question", {
      metric: a.metric_label, region: a.label, period: a.period,
      value: a.value != null ? String(a.value) : "—",
      base: a.base != null ? String(a.base) : "—",
      dev: a.deviation != null ? (a.deviation >= 0 ? "+" : "") + a.deviation.toFixed(1) : "—",
      pct: a.pct_change != null ? (a.pct_change >= 0 ? "+" : "") + a.pct_change.toFixed(1) + "%" : "—",
    });
    try {
      const r = await api.aiAsk(q, lang, { context: { anomaly: a } });
      setAiResult(r);
    } catch (e: any) {
      setAiResult({ answer: String(e), sources: [] });
    } finally {
      setAiLoading(false);
    }
  };

  // ---- loading / error states ----
  if (loading && !data) return <Spinner />;
  if (err) {
    return (
      <div className="card card-pad">
        <SectionTitle>{t("alerts_anomalies")}</SectionTitle>
        <div className="text-sm text-rose-600">{t("err_load_failed")}</div>
        <button onClick={load} className="mt-3 text-sm font-semibold text-[#1F5FE0] hover:text-[#0B3FA8]">{t("retry")}</button>
      </div>
    );
  }
  if (!data) return <Spinner />;

  // card counts (auto-update with period/threshold filters via re-fetch)
  const have = data.districts_with_data ?? 0;
  const total = data.districts_total ?? 0;

  return (
    <div className="space-y-5">
      {/* toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-semibold bg-[#0F2A4A] text-white">
          {toast}
        </div>
      )}

      {/* cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button onClick={() => scrollTo(anomsRef)} className="card card-pad text-left hover:border-brand transition-colors">
          <div className="flex items-center gap-3">
            <div className="icon-badge" style={{ background: "#FEF3C7", color: "#D97706" }}><Bell className="w-5 h-5" aria-hidden /></div>
            <div>
              <div className="lbl">{t("alerts_anomalies")}</div>
              <div className="text-xs text-surface-400">{t("al_period")}: {data.period}</div>
            </div>
          </div>
          <div className="text-[30px] font-bold mt-3 text-[#D97706]">{anomalies.length}</div>
          <div className="text-xs text-brand mt-1 inline-flex items-center gap-1">{t("al_view_list")} <ArrowDown className="w-3 h-3" /></div>
        </button>
        <div className="card card-pad">
          <div className="flex items-center gap-3">
            <div className="icon-badge" style={{ background: "#E7F6EC", color: "#16A34A" }}><Database className="w-5 h-5" aria-hidden /></div>
            <div className="lbl">{t("districts_with_data")}</div>
          </div>
          <div className="text-[30px] font-bold mt-3">{have} / {total}</div>
          <div className="text-xs text-surface-400 mt-1">{t("al_districts_of", { have, total })}</div>
        </div>
        <button onClick={() => scrollTo(missRef)} className="card card-pad text-left hover:border-brand transition-colors">
          <div className="flex items-center gap-3">
            <div className="icon-badge" style={{ background: "#FDECEC", color: "#DC2626" }}><AlertTriangle className="w-5 h-5" aria-hidden /></div>
            <div>
              <div className="lbl">{t("alerts_missing")}</div>
              <div className="text-xs text-surface-400">{data.period}</div>
            </div>
          </div>
          <div className="text-[30px] font-bold mt-3">{missing.length}</div>
          <div className="text-xs text-brand mt-1 inline-flex items-center gap-1">{t("al_view_list")} <ArrowDown className="w-3 h-3" /></div>
        </button>
      </div>

      {/* filters */}
      <div className="card card-pad">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("al_period_filter")}>
            <select className="f-input" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
              {PERIOD_MONTHS.map((m) => <option key={m} value={m}>{t(`month_${m}`)} {t("cumulative_jan_to").replace("{m}", t(`month_${m}`))}</option>)}
            </select>
          </Field>
          <Field label={t("al_threshold")}>
            <select className="f-input" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}>
              {THRESHOLDS.map((x) => <option key={x} value={x}>×{x}</option>)}
            </select>
          </Field>
          <Field label={t("al_filter_metric")}>
            <select className="f-input" value={fMetric} onChange={(e) => setFMetric(e.target.value)}>
              <option value="all">{t("al_sev_all")}</option>
              {METRICS.map((m) => <option key={m} value={m}>{t("rep_cat_" + m) || m}</option>)}
            </select>
          </Field>
          <Field label={t("al_filter_sev")}>
            <select className="f-input" value={fSev} onChange={(e) => setFSev(e.target.value)}>
              <option value="all">{t("al_sev_all")}</option>
              {["high", "medium", "low", "seasonal"].map((s) => <option key={s} value={s}>{t("sev_" + s)}</option>)}
            </select>
          </Field>
          <Field label={t("al_search_region")}>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-surface-400" aria-hidden />
              <input className="f-input pl-8" style={{ minWidth: 160 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("al_search_region")} />
            </div>
          </Field>
          <span className="text-xs text-surface-400 flex items-center gap-1 mb-2"><Info className="w-3.5 h-3.5" /> {t("al_rule_threshold", { x: "×" + threshold })}</span>
        </div>
      </div>

      {/* anomalies table */}
      <div ref={anomsRef} className="card card-pad">
        <SectionTitle icon={<AlertTriangle className="w-4 h-4" aria-hidden />}>{t("alerts_anomalies")} <span className="text-xs text-surface-400 ml-2">({filtered.length})</span></SectionTitle>
        {filtered.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <Th onClick={() => toggleSort("label")}>{t("region")}</Th>
                  <Th onClick={() => toggleSort("metric")}>{t("al_metric")}</Th>
                  <th className="py-2 pr-3 text-surface-500">{t("al_period")}</th>
                  <Th onClick={() => toggleSort("value")} right>{t("al_value")}</Th>
                  <Th onClick={() => toggleSort("base")} right>{t("al_base")}</Th>
                  <Th onClick={() => toggleSort("deviation")} right>{t("al_abs_change")} <RefBadge/></Th>
                  <Th onClick={() => toggleSort("pct_change")} right>{t("al_pct_change")} <RefBadge/></Th>
                  <Th onClick={() => toggleSort("severity")}>{t("al_severity")} <RefBadge/></Th>
                  <th className="py-2 pr-3 text-surface-500">{t("al_source_file")}</th>
                  <th className="py-2 pr-3 text-surface-500">{t("al_status")}</th>
                  <th className="py-2 text-surface-500">{t("al_action")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a: any) => (
                  <tr key={keyOf(a)} className="hover:bg-[#F8FAFD]">
                    <td className="font-medium py-2 pr-3">{a.label}</td>
                    <td className="py-2 pr-3">{a.metric_label}</td>
                    <td className="py-2 pr-3 text-surface-500 text-xs">{a.period}</td>
                    <td className="py-2 pr-3 text-right num">{num(a.value)}</td>
                    <td className="py-2 pr-3 text-right num text-surface-500">{num(a.base)}</td>
                    <td className="py-2 pr-3 text-right num" style={{ color: (a.deviation ?? 0) >= 0 ? "#16A34A" : "#DC2626" }}>
                      {a.deviation == null ? "—" : `${a.deviation >= 0 ? "+" : ""}${a.deviation.toFixed(1)}`}
                    </td>
                    <td className="py-2 pr-3 text-right num" style={{ color: (a.pct_change ?? 0) >= 0 ? "#16A34A" : "#DC2626" }}>
                      {a.pct_change == null ? <span className="text-surface-400" title={t("al_base_zero")}>{t("al_base_zero")}</span> : `${a.pct_change >= 0 ? "+" : ""}${a.pct_change.toFixed(1)}%`}
                    </td>
                    <td className="py-2 pr-3"><SeverityBadge sev={a.severity} t={t} /></td>
                    <td className="py-2 pr-3 text-xs text-surface-500" title={`${a.source || ""} · ${a.period_source || ""}`}>{a.source || "—"}</td>
                    <td className="py-2 pr-3"><StatusBadge status={a.status} t={t} /></td>
                    <td className="py-2">
                      <div className="flex gap-1 flex-wrap">
                        <MiniBtn onClick={() => saveDecision(a, "checked_ok")} disabled={a.status === "reviewed_ok"}>{t("al_checked_ok")}</MiniBtn>
                        <MiniBtn onClick={() => { setFixFor(a); setFixType(""); setFixNote(""); }} disabled={a.status === "sent_fix"} tone="rose">{t("al_send_fix")}</MiniBtn>
                        <MiniBtn onClick={() => { setNoteFor(a); setNoteText(""); }} tone="ghost">{t("al_add_note")}</MiniBtn>
                        <MiniBtn onClick={() => askAI(a)} tone="ghost">{t("al_ai_analyze")}</MiniBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" aria-hidden />
            <div className="text-sm text-emerald-600">{t("al_none_found", { n: data.metrics_checked })}</div>
          </div>
        )}
      </div>

      {/* missing / stale data */}
      <div ref={missRef} className="card card-pad">
        <SectionTitle icon={<Database className="w-4 h-4" aria-hidden />}>{t("al_missing_title")}</SectionTitle>
        {missing.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="py-2 pr-3">{t("region")}</th><th className="py-2 pr-3">{t("al_missing_metric")}</th>
                  <th className="py-2 pr-3">{t("al_missing_what")}</th><th className="py-2 pr-3">{t("al_missing_reason")}</th>
                  <th className="py-2 pr-3">{t("al_missing_solution")}</th><th className="py-2">{t("al_missing_last")}</th>
                </tr>
              </thead>
              <tbody>
                {missing.map((m: any, i: number) => (
                  <tr key={i} className="hover:bg-[#F8FAFD]">
                    <td className="font-medium py-2 pr-3">{m.label}</td>
                    <td className="py-2 pr-3">{m.metric_label}</td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ background: m.what === "stale" ? "#FEF3C7" : "#FDECEC", color: m.what === "stale" ? "#D97706" : "#DC2626" }}>
                        {t(m.what === "stale" ? "al_missing_stale" : "al_missing_absent")}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-surface-500">{m.last_period ? t("al_missing_stale_reason") : t("al_missing_absent_reason")}</td>
                    <td className="py-2 pr-3 text-xs text-surface-500">{t(m.what === "stale" ? "al_missing_stale_fix" : "al_missing_absent_fix")}</td>
                    <td className="py-2 text-xs text-surface-500">{m.last_period || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" aria-hidden />
            <div className="text-sm text-emerald-600">{t("al_none_found", { n: data.metrics_checked })}</div>
          </div>
        )}
      </div>

      {/* AI analysis modal */}
      {aiFor && (
        <Modal title={t("al_ai_analyze") + " — " + aiFor.label} onClose={() => setAiFor(null)}>
          {aiLoading ? <Spinner /> : aiResult ? (
            <div className="text-sm space-y-2">
              <div className="text-[#0F2A4A]">{aiResult.answer}</div>
              {aiResult.sources && aiResult.sources.length > 0 && (
                <div className="text-xs text-surface-500">
                  {t("ai_sources")}: {aiResult.sources.join(", ")}
                </div>
              )}
              <p className="text-[11px] text-txt2 italic">{t("forecast_not_official")}</p>
            </div>
          ) : <div className="text-sm text-txt2">—</div>}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setAiFor(null)} className="px-3 py-1.5 rounded-md text-sm bg-surface-50 hover:bg-surface-100">{t("al_fix_cancel")}</button>
          </div>
        </Modal>
      )}

      {/* Fix modal */}
      {fixFor && (
        <Modal title={t("al_fix_modal_title")} onClose={() => setFixFor(null)}>
          <Field label={t("al_fix_type")}>
            <select className="f-input w-full" value={fixType} onChange={(e) => setFixType(e.target.value)}>
              <option value="">—</option>
              <option value="wrong_value">{t("al_fix_wrong_value")}</option>
              <option value="wrong_period">{t("al_fix_wrong_period")}</option>
              <option value="missing_data">{t("al_fix_missing_data")}</option>
            </select>
          </Field>
          <div className="mt-3">
            <Field label={t("al_fix_explain")}>
              <textarea className="f-input w-full" rows={3} value={fixNote} onChange={(e) => setFixNote(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setFixFor(null)} className="px-3 py-1.5 rounded-md text-sm bg-surface-50 hover:bg-surface-100">{t("al_fix_cancel")}</button>
            <button onClick={confirmFix} className="px-3 py-1.5 rounded-md text-sm font-semibold bg-[#DC2626] text-white hover:bg-rose-600">{t("al_fix_confirm")}</button>
          </div>
        </Modal>
      )}

      {/* Note modal */}
      {noteFor && (
        <Modal title={t("al_note_modal_title")} onClose={() => setNoteFor(null)}>
          <Field label={t("al_fix_explain")}>
            <textarea className="f-input w-full" rows={4} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setNoteFor(null)} className="px-3 py-1.5 rounded-md text-sm bg-surface-50 hover:bg-surface-100">{t("al_note_cancel")}</button>
            <button onClick={confirmNote} className="px-3 py-1.5 rounded-md text-sm font-semibold text-white" style={{ background: "#1F5FE0" }}>{t("al_note_save")}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---- helpers (same design as before) ----
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-surface-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Th({ children, onClick, right, active, dir }: { children: React.ReactNode; onClick?: () => void; right?: boolean; active?: boolean; dir?: string }) {
  return (
    <th className={`py-2 pr-3 ${right ? "text-right" : ""} ${onClick ? "cursor-pointer hover:text-brand" : "text-surface-500"} select-none`} onClick={onClick}>
      {children}{active ? <span className="ml-1 text-[10px]">{dir === "asc" ? "↑" : "↓"}</span> : null}
    </th>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card card-pad w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-[#0F2A4A]">{title}</div>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600 text-lg leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SeverityBadge({ sev, t }: { sev: string; t: (k: string) => string }) {
  const map: Record<string, [string, string]> = {
    high: ["#FDECEC", "#DC2626"], medium: ["#FEF3C7", "#D97706"], low: ["#E7F6EC", "#16A34A"],
    seasonal: ["#F1F5F9", "#64748B"],
  };
  const [bg, fg] = map[sev] || map.low;
  const tip = sev === "seasonal" ? t("badge_seasonal_tip") : undefined;
  return (
    <span title={tip} className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold cursor-help" style={{ background: bg, color: fg }}>
      {t("sev_" + sev)}
    </span>
  );
}

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const map: Record<string, [string, string]> = {
    needs_review: ["#FEF3C7", "#D97706"], reviewed_ok: ["#E7F6EC", "#16A34A"], sent_fix: ["#FDECEC", "#DC2626"],
  };
  const [bg, fg] = map[status] || map.needs_review;
  const key = status === "reviewed_ok" ? "al_reviewed_ok" : status === "sent_fix" ? "al_sent_fix" : "al_needs_review";
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: bg, color: fg }}>
      {t(key)}
    </span>
  );
}

function RefBadge() {
  const { t } = useTranslation();
  return (
    <span title={t("badge_reference_tip")} className="inline-block ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-surface-100 text-surface-500 border border-surface-200 cursor-help align-middle">
      {t("badge_reference")}
    </span>
  );
}

function MiniBtn({ children, onClick, disabled, tone }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: "rose" | "ghost" }) {
  const cls = tone === "rose" ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
    : tone === "ghost" ? "bg-surface-50 text-surface-600 hover:bg-surface-100"
    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100";
  return (
    <button onClick={onClick} disabled={disabled}
      className={`px-2 py-1 rounded-md text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}>
      {children}
    </button>
  );
}
