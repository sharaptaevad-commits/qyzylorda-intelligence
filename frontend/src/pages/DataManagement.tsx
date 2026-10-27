import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, getUser } from "../api";
import { ErrorBox, Spinner, Empty } from "../components/ui";
import { UploadCloud, CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet } from "lucide-react";

const STEPS = ["dm_step_upload", "dm_step_meta", "dm_step_preview", "dm_step_check", "dm_step_confirm", "dm_step_result"];
// heuristic column mapping (source header -> DB field)
const FIELD_FIELDS = ["metric_key", "region", "period", "unit", "value", "year"];

export default function DataManagement() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const user = getUser();
  const canWrite = user?.role === "admin" || user?.role === "data_manager";

  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [meta, setMeta] = useState<any>({ source_name: "", file_date: "", period: "", period_type: "cum", metric_type: "idx", unit: "%" });
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [checkResult, setCheckResult] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { refreshHist(); }, []);
  function refreshHist() { api.dataHistory().then(setHistory).catch(() => {}); }

  const template = useMemo(() => {
    if (!file?.name) return null;
    const n = file.name.toLowerCase();
    if (n.includes("t-04-01") || n.includes("т-04-01")) return "T-04-01-M";
    if (n.includes("oked")) return "OKED";
    return null;
  }, [file]);

  async function onFile(f: File) {
    setErr(null); setResult(null); setCheckResult(null);
    setFile(f);
    if (f.name.toLowerCase().includes(".xlsm") || f.name.toLowerCase().includes("macro")) {
      setErr(new Error(t("dm_macro_rejected"))); return;
    }
    setBusy(true);
    try {
      const p = await api.dataPreview(f);
      setPreview(p);
      // auto-map columns by header keyword
      const m: Record<string, string> = {};
      (p.header || []).forEach((h: any, i: number) => {
        const hs = String(h).toLowerCase();
        if (hs.includes("region") || hs.includes("айма") || hs.includes("аудан") || hs.includes("район")) m[h] = "region";
        else if (hs.includes("period") || hs.includes("кезең") || hs.includes("период")) m[h] = "period";
        else if (hs.includes("value") || hs.includes("мән") || hs.includes("значение")) m[h] = "value";
        else if (hs.includes("unit") || hs.includes("бірлік") || hs.includes("ед")) m[h] = "unit";
        else if (hs.includes("metric") || hs.includes("көрсет") || hs.includes("показ")) m[h] = "metric_key";
        else if (hs.includes("year") || hs.includes("жыл")) m[h] = "year";
        if (!Object.values(m).includes(m[h] || "")) m[h] = m[h] || "";
      });
      setMapping(m);
      // template prefill
      if (template) setMeta((m2: any) => ({ ...m2, period_type: "cum", unit: "%" }));
      setStep(1);
    } catch (e: any) { setErr(e); } finally { setBusy(false); }
  }

  async function doCheck() {
    if (!preview) return;
    setBusy(true); setErr(null);
    try {
      const records = (preview.rows || []).map((row: any) => {
        const arr = Array.isArray(row) ? row : Object.values(row);
        const rec: any = {};
        (preview.header || []).forEach((h: any, i: number) => {
          const field = mapping[h];
          if (field) rec[field] = arr[i];
        });
        return rec;
      });
      // client-side validation mirror of backend _validate_record
      const valid: any[] = [], rejected: any[] = [];
      const seen = new Set<string>();
      for (const rec of records) {
        const issues: string[] = [];
        if (!rec.region || !String(rec.region).trim()) issues.push(t("dm_unknown_region"));
        if (rec.value === undefined || rec.value === null || rec.value === "") issues.push(t("al_empty_reason"));
        else { const v = Number(String(rec.value).replace(",", ".")); if (isNaN(v)) issues.push("type"); }
        if (rec.value != null && Number(rec.value) < 0) issues.push("negative");
        const key = `${rec.metric_key}|${rec.region}|${rec.period}|${rec.unit}|${rec.year}`;
        if (seen.has(key)) issues.push(t("dm_dup_conflict"));
        seen.add(key);
        if (issues.length) rejected.push({ rec, issues });
        else valid.push(rec);
      }
      setCheckResult({ valid, rejected, total: records.length });
      setStep(4);
    } catch (e: any) { setErr(e); } finally { setBusy(false); }
  }

  async function doConfirm() {
    if (!checkResult) return;
    setBusy(true); setErr(null);
    try {
      const records = checkResult.valid;
      const r = await api.dataImport({ mapping, records, source_label: meta.source_name || file?.name, confirmed: true,
        period_type: meta.period_type });
      setResult(r); setStep(5); refreshHist();
    } catch (e: any) { setErr(e); } finally { setBusy(false); }
  }

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); };

  return (
    <div className="space-y-5">
      {/* stepper */}
      <div className="card card-pad">
        <div className="flex flex-wrap items-center gap-1">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold ${i === step ? "bg-brand text-white" : i < step ? "bg-emerald-50 text-emerald-700" : "bg-surface-50 text-surface-400"}`}>
                <span className="tabular-nums">{i + 1}</span> {t(s)}
              </div>
              {i < STEPS.length - 1 && <div className="w-4 h-px bg-surface-200" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {err && <div className="card card-pad"><ErrorBox error={err} /><button className="f-btn f-btn-ghost mt-2" onClick={() => setErr(null)}>{t("rep_retry")}</button></div>}

      {/* STEP 1: upload */}
      {step === 0 && (
        <div className="card card-pad">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${drag ? "border-brand bg-[#F4F6FA]" : "border-surface-200 hover:border-brand"}`}>
            <UploadCloud className="w-8 h-8 text-surface-400 mx-auto mb-3" aria-hidden />
            <div className="text-sm font-medium">{t("dm_drag")}</div>
            <div className="text-xs text-surface-400 mt-1">.xlsx · .csv · {t("dm_choose")}</div>
            <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          </div>
          {busy && <div className="mt-4"><Spinner /></div>}
          {template && <div className="mt-3 text-xs text-emerald-600">{t("dm_template_found", { n: template })}</div>}
        </div>
      )}

      {/* STEP 2: meta */}
      {step === 1 && preview && (
        <div className="card card-pad space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t("dm_source_name")}><input className="f-input" value={meta.source_name} onChange={(e) => setMeta({ ...meta, source_name: e.target.value })} placeholder={file?.name} /></Field>
            <Field label={t("dm_file_date")}><input type="date" className="f-input" value={meta.file_date} onChange={(e) => setMeta({ ...meta, file_date: e.target.value })} /></Field>
            <Field label={t("dm_period")}><input className="f-input" value={meta.period} onChange={(e) => setMeta({ ...meta, period: e.target.value })} placeholder="2026-Q3" /></Field>
            <Field label={t("dm_period_type")}>
              <select className="f-input" value={meta.period_type} onChange={(e) => setMeta({ ...meta, period_type: e.target.value })}>
                <option value="cum">{t("dm_pt_cum")}</option><option value="month">{t("dm_pt_month")}</option><option value="year">{t("dm_pt_year")}</option>
              </select>
            </Field>
            <Field label={t("dm_metric_type")}>
              <select className="f-input" value={meta.metric_type} onChange={(e) => setMeta({ ...meta, metric_type: e.target.value })}>
                <option value="idx">{t("dm_mt_idx")}</option><option value="vol">{t("dm_mt_vol")}</option>
              </select>
            </Field>
            <Field label={t("dm_unit")}>
              <select className="f-input" value={meta.unit} onChange={(e) => setMeta({ ...meta, unit: e.target.value })}>
                <option value="%">%</option><option value="тыс. теңге">мың тг</option><option value="млрд">млрд тг</option>
              </select>
            </Field>
          </div>
          <div className="flex gap-2">
            <button className="f-btn f-btn-ghost" onClick={() => setStep(0)}>{t("dm_step_upload")}</button>
            <button className="f-btn f-btn-primary" onClick={() => setStep(2)}>{t("dm_step_preview")}</button>
          </div>
        </div>
      )}

      {/* STEP 3: preview + mapping */}
      {step === 2 && preview && (
        <div className="card card-pad space-y-4">
          <div className="text-xs text-surface-500">{file?.name} · {preview.total_rows} {t("dm_rows_ok").toLowerCase()}</div>
          <div>
            <div className="text-sm font-semibold mb-2">{t("dm_map_header")}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(preview.header || []).map((h: any) => (
                <div key={String(h)} className="flex items-center gap-2 text-xs">
                  <span className="text-surface-600 truncate" title={String(h)}>{h}</span>
                  <span className="text-surface-400">{t("dm_map_to")}</span>
                  <select className="f-input" style={{ height: 32, fontSize: 12 }} value={mapping[h] || ""} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}>
                    <option value="">—</option>
                    {FIELD_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto max-h-72">
            <table className="tbl">
              <thead><tr>{(preview.header || []).map((h: any, i: number) => <th key={i}>{h}</th>)}</tr></thead>
              <tbody>
                {(preview.rows || []).slice(0, 50).map((row: any, i: number) => (
                  <tr key={i}>{(Array.isArray(row) ? row : Object.values(row)).map((c: any, j: number) => <td key={j}>{String(c ?? "")}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button className="f-btn f-btn-ghost" onClick={() => setStep(1)}>{t("dm_step_meta")}</button>
            <button className="f-btn f-btn-primary" onClick={doCheck}>{t("dm_step_check")}</button>
          </div>
        </div>
      )}

      {/* STEP 4: check + confirm */}
      {step === 4 && checkResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat tone="ok" n={checkResult.valid.length} label={t("dm_rows_ok")} />
            <Stat tone="warn" n={checkResult.rejected.length} label={t("dm_rows_warn")} />
            <Stat tone="err" n={checkResult.rejected.filter((r: any) => r.issues.length).length} label={t("dm_rows_err")} />
          </div>
          {checkResult.rejected.length > 0 && (
            <div className="card card-pad">
              <div className="text-sm font-semibold mb-2">{t("dm_rejected_count")}</div>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {checkResult.rejected.slice(0, 50).map((r: any, i: number) => (
                  <div key={i} className="text-xs text-[#C24141]">• {r.issues?.join(", ")}</div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button className="f-btn f-btn-ghost" onClick={() => setStep(2)}>{t("dm_step_preview")}</button>
            <button className="f-btn f-btn-primary" disabled={!canWrite || checkResult.valid.length === 0} onClick={doConfirm}>
              {busy ? <Spinner /> : t("dm_confirm")}
            </button>
          </div>
          {!canWrite && <p className="text-xs text-surface-400">{t("rep_no_data")} (рөл: {user?.role})</p>}
          {checkResult.valid.length === 0 && <p className="text-xs text-[#C24141]">{t("dm_no_records")}</p>}
        </div>
      )}

      {/* STEP 5: result */}
      {step === 5 && result && (
        <div className="card card-pad">
          <CheckCircle2 className="w-7 h-7 text-emerald-500 mb-3" aria-hidden />
          <div className="flex flex-wrap gap-3 text-sm">
            <span><b className="text-emerald-600">+{result.added}</b> {t("dm_added")}</span>
            <span><b>{result.duplicates}</b> {t("dm_skipped")}</span>
            <span><b className="text-rose-600">{result.rejected?.length}</b> {t("dm_rejected_count")}</span>
          </div>
          <div className="mt-3"><button className="f-btn f-btn-ghost" onClick={() => { setStep(0); setFile(null); setPreview(null); setCheckResult(null); setResult(null); }}>+ {t("dm_step_upload")}</button></div>
        </div>
      )}

      {/* history */}
      <div className="card card-pad">
        <div className="text-sm font-semibold mb-3">{t("dm_history")}</div>
        {history.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr>
                <th>{t("period")}</th><th>{t("dm_h_file")}</th><th>{t("dm_h_period")}</th>
                <th className="text-right">{t("dm_h_records")}</th><th>{t("dm_h_status")}</th><th>{t("dm_h_by")}</th><th>{t("dm_h_action")}</th>
              </tr></thead>
              <tbody>
                {history.map((h: any, i: number) => (
                  <tr key={i}>
                    <td className="tabular-nums text-xs">{h.ts ? new Date(h.ts * 1000).toLocaleString() : "—"}</td>
                    <td className="text-xs" title={h.note || ""}>{h.note || h.doc_id || "—"}</td>
                    <td className="text-xs text-surface-500">{h.note || "—"}</td>
                    <td className="num">{h.count}</td>
                    <td>
                      {h.rolled_back
                        ? <span className="badge-neg">{t("dm_st_returned")}</span>
                        : <span className="badge-pos">{t("dm_st_ok")}</span>}
                    </td>
                    <td className="text-xs">{h.decided_by || "—"}</td>
                    <td>
                      <button
                        className="f-btn f-btn-ghost" style={{ height: 32 }}
                        disabled={!canWrite || h.rolled_back}
                        onClick={async () => {
                          if (!confirm(t("dm_rollback_confirm"))) return;
                          try { const r = await api.dataRollback(h.ts); alert(t("dm_rollback_done", { n: r.removed })); refreshHist(); }
                          catch (e: any) { alert(String(e)); }
                        }}>
                        {t("dm_rollback")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty text={t("empty_state")} />}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<label className="block"><span className="block text-xs font-medium text-surface-500 mb-1">{label}</span>{children}</label>);
}

function Stat({ n, label, tone }: { n: number; label: string; tone: "ok" | "warn" | "err" }) {
  const c = { ok: "#16A34A", warn: "#D97706", err: "#DC2626" }[tone];
  const I = { ok: CheckCircle2, warn: AlertTriangle, err: XCircle }[tone];
  return (
    <div className="card card-pad">
      <I className="w-5 h-5 mb-2" style={{ color: c }} aria-hidden />
      <div className="text-2xl font-bold tabular-nums" style={{ color: c }}>{n}</div>
      <div className="text-xs text-surface-500">{label}</div>
    </div>
  );
}
