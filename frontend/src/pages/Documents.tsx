import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api, download } from "../api";
import { ErrorBox, Spinner, SectionTitle, Empty, StatusBadge, fmtNum } from "../components/ui";
import { UploadCloud, RefreshCw, WifiOff } from "lucide-react";

// Real supported formats for table/text extraction (Phase 1)
const WORKING = [".xlsx", ".xls", ".csv", ".txt", ".pdf", ".docx"];
const SOON: string[] = [];

export default function Documents() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const [docs, setDocs] = useState<any[]>([]);
  const [docsErr, setDocsErr] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<any>(null);
  const [errKind, setErrKind] = useState<string>("");
  const [active, setActive] = useState<any>(null);
  const [tab, setTab] = useState("compare");
  const [sel, setSel] = useState<Record<number, boolean>>({});
  const [imported, setImported] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const friendly = useCallback((e: any): string => {
    const msg = e?.message || String(e);
    if (/Failed to fetch|NetworkError|Load failed|ECONNREFUSED/i.test(msg)) return t("doc_server_off");
    if (/413|size/i.test(msg)) return t("doc_size_err");
    if (/format|parse|corrupt|400/i.test(msg)) return t("doc_fmt_err");
    if (/500|process|analyze/i.test(msg)) return t("doc_proc_err");
    return msg;
  }, [t]);

  const refresh = useCallback(() => {
    api.documents().then((d) => { setDocs(d.documents || d || []); setDocsErr(null); })
      .catch((e) => setDocsErr(friendly(e)));
  }, [t]);
  useEffect(refresh, [refresh]);

  async function start(f: File) {
    const ext = "." + (f.name.split(".").pop() || "").toLowerCase();
    if (!WORKING.includes(ext) && SOON.includes(ext)) {
      setErrKind("fmt"); setErr(new Error(t("doc_pdf_soon"))); setFile(null); return;
    }
    if (f.size > 25 * 1024 * 1024) { setErrKind("size"); setErr(new Error(t("doc_size_err"))); setFile(null); return; }
    setFile(f); setBusy(true); setErr(null); setImported(null);
    try {
      const doc = await api.upload(f);
      const analyzed = await api.analyze(doc.id);
      refresh(); setActive(analyzed); setTab("compare");
    } catch (e: any) {
      setErrKind("net");
      setErr(new Error(friendly(e)));
    } finally { setBusy(false); }
  }
  async function openDoc(d: any) {
    setActive(await api.document(d.id)); setSel({}); setImported(null);
  }

  async function doImport() {
    const comp = active?.comparison || {};
    const recs = (comp.new_in_document || []).map((r: any, i: number) => sel[i] ? r : null).filter(Boolean);
    setImported(await api.importDoc(active.id, recs, true));
    refresh();
  }

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) start(f); };
  const comp = active?.comparison || { matched: [], discrepancies: [], new_in_document: [], missing_in_document: [] };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Upload */}
        <div className="card card-pad lg:col-span-1">
          <SectionTitle>{t("doc_upload")}</SectionTitle>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${drag ? "border-brand bg-[#F4F6FA]" : "border-surface-200 hover:border-brand"}`}>
            <UploadCloud className="w-8 h-8 text-surface-400 mx-auto mb-3" aria-hidden />
            <div className="text-sm font-medium">{t("doc_upload")}</div>
            <div className="text-xs text-surface-400 mt-1">{t("doc_formats")}</div>
            <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls,.csv,.txt,.pdf,.docx" onChange={(e) => { const f = e.target.files?.[0]; if (f) start(f); }} />
          </div>
          {busy && <div className="mt-3 text-sm text-surface-500 flex items-center gap-2"><Spinner /> {t("doc_processing")}</div>}
          {file && !busy && <div className="mt-3 text-xs text-emerald-600">✓ {file.name}</div>}
          {err && (
            <div className="mt-3 flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg p-3">
              <WifiOff className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" aria-hidden />
              <div className="text-xs text-rose-700 flex-1">{err.message}</div>
              <button onClick={() => { setErr(null); setFile(null); }} className="text-xs font-semibold text-rose-700 underline">{t("doc_retry")}</button>
            </div>
          )}
        </div>

        {/* History */}
        <div className="card card-pad lg:col-span-2">
          <div className="flex items-center justify-between">
            <SectionTitle>{t("doc_history")}</SectionTitle>
            <button onClick={refresh} className="text-xs text-brand inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> {t("doc_retry")}</button>
          </div>
          {docsErr ? (
            <div className="text-sm text-rose-600 py-6 text-center">{docsErr} <button onClick={refresh} className="underline ml-2">{t("doc_retry")}</button></div>
          ) : docs.length ? (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>{t("doc_choose")}</th><th>{t("doc_h_type")}</th><th>{t("doc_h_date")}</th><th>{t("doc_h_status")}</th><th className="text-right">{t("doc_h_count")}</th><th></th></tr></thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id} className={active?.id === d.id ? "bg-[#E8F0FE]/40" : ""}>
                      <td className="font-medium">{d.filename}</td>
                      <td className="text-xs text-surface-500">{("." + (d.filename.split(".").pop() || "")).toUpperCase()}</td>
                      <td className="text-xs text-surface-500">{d.uploaded_at}</td>
                      <td><StatusBadge status={d.status} /></td>
                      <td className="num text-xs">{d.records?.length ?? 0}</td>
                      <td className="text-right"><button className="f-btn f-btn-ghost" style={{ height: 32 }} onClick={() => openDoc(d)}>{t("doc_view")}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty text={t("doc_none_uploaded")} />}
        </div>
      </div>

      {/* Result */}
      {active && (
        <div className="card card-pad">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div>
              <div className="text-base font-semibold">{active.filename}</div>
              <div className="text-xs text-surface-500 flex items-center gap-2">
                <span>{active.records?.length} {t("value").toLowerCase()}</span>
                <StatusBadge status={active.status} />
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#D97706" }}>{t("doc_non_official")}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="f-btn f-btn-ghost" onClick={() => download(api.exportUrl(active.id, "pdf", lang))}>{t("report_pdf")}</button>
              <button className="f-btn f-btn-ghost" onClick={() => download(api.exportUrl(active.id, "xlsx", lang))}>{t("report_xlsx")}</button>
            </div>
          </div>

          <div className="flex gap-1 border-b border-surface-200 mb-4">
            {[["compare", t("tab_compare")], ["ai", t("tab_ai")], ["import", t("tab_import")]].map(([k, lbl]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-brand text-brand" : "border-transparent text-surface-500"}`}>{lbl}</button>
            ))}
          </div>

          {tab === "compare" && <ComparisonView comp={comp} />}
          {tab === "ai" && <AiTab doc={active} lang={lang} />}
          {tab === "import" && (
            <div>
              <p className="text-xs text-surface-400 mb-3">{t("doc_not_auto_import")}</p>
              {(comp.new_in_document || []).length ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="tbl">
                      <thead><tr><th></th><th>{t("metric")}</th><th>{t("region")}</th><th>{t("period")}</th><th className="text-right">{t("doc_value")}</th><th>{t("unit")}</th><th>{t("doc_confidence")}</th></tr></thead>
                      <tbody>
                        {(comp.new_in_document || []).map((r: any, i: number) => (
                          <tr key={i}>
                            <td><input type="checkbox" checked={!!sel[i]} onChange={(e) => setSel({ ...sel, [i]: e.target.checked })} /></td>
                            <td>{r.metric}</td><td>{r.region}</td><td>{r.period}</td>
                            <td className="num">{fmtNum(r.doc_value)}</td><td>{r.unit}</td>
                            <td className="text-xs text-surface-500">{r.confidence || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <button className="f-btn f-btn-primary" onClick={doImport}>{t("import_selected")}</button>
                    {imported && <span className="badge-pos">{t("imported")}: {imported.added} · {imported.skipped_existing} dup</span>}
                  </div>
                </>
              ) : <Empty text={t("doc_insufficient")} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ComparisonView({ comp }: { comp: any }) {
  const { t } = useTranslation();
  const groups = [
    [t("a_title"), comp.matched, "badge-pos"],
    [t("b_title"), comp.discrepancies, "badge-neg"],
    [t("c_title"), comp.new_in_document, "badge-teal"],
    [t("d_title"), comp.missing_in_document, "badge-warn"],
  ] as const;
  return (
    <div className="space-y-5">
      {groups.map(([title, rows, badge], gi) => (
        <div key={gi}>
          <div className="flex items-center gap-2 mb-2">
            <span className={badge as string}>{(rows as any[]).length}</span>
            <span className="panel-title">{title}</span>
          </div>
          {(rows as any[]).length ? (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>{t("metric")}</th><th>{t("region")}</th><th>{t("period")}</th><th className="text-right">{t("doc_value")}</th><th className="text-right">{t("site_value")}</th><th className="text-right">{t("abs_diff")}</th><th className="text-right">{t("pct_diff")}</th><th>{t("sources")}</th></tr></thead>
                <tbody>
                  {(rows as any[]).slice(0, 60).map((r: any, i: number) => (
                    <tr key={i}>
                      <td>{r.metric}</td><td>{r.region}</td><td>{r.period}</td>
                      <td className="num">{fmtNum(r.doc_value)}</td><td className="num">{fmtNum(r.site_value)}</td>
                      <td className="num">{r.abs_diff !== undefined ? fmtNum(r.abs_diff) : "—"}</td>
                      <td className="num">{r.pct_diff !== undefined && r.pct_diff !== null ? r.pct_diff.toFixed(1) + "%" : "—"}</td>
                      <td className="text-xs text-surface-500">{r.doc_source || r.site_source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="text-xs text-surface-400">—</div>}
        </div>
      ))}
    </div>
  );
}

function AiTab({ doc, lang }: { doc: any; lang: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.aiAnalysis(doc.id, lang).then(setData).catch(() => {}); }, [doc.id, lang]);
  if (!data) return <Spinner />;
  const s = data.summary || {};
  return (
    <div className="space-y-3 text-sm">
      {[["doc", s.doc], ["match", s.match], ["diff", s.diff], ["new", s.new], ["caveat", s.caveat]].filter(([, v]) => v).map(([k, v], i) => (
        <p key={i} className="leading-relaxed">{v as string}</p>
      ))}
      {data.findings?.length > 0 && (
        <div>
          <div className="lbl mb-1">{t("ai_obs")}</div>
          <ul className="list-disc pl-5 space-y-1 text-surface-500">
            {data.findings.slice(0, 8).map((f: string, i: number) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
