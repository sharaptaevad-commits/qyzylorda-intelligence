// Report Intake — Upload report (Excel/CSV) (independent module, Phase 1).
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { riGet, riPost, type RiEntity } from "./types";
import { useNavigate } from "react-router-dom";
import RiShell from "./Shell";

export default function RiUpload() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [entities, setEntities] = useState<RiEntity[]>([]);
  const [entityId, setEntityId] = useState("");
  const [period, setPeriod] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    riGet<{ entities: RiEntity[] }>("/entities").then(d => {
      setEntities(d.entities);
      if (d.entities[0]) setEntityId(d.entities[0].id);
    }).catch(() => {});
  }, []);

  const doUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entityId || !period || !file) { setMsg(t("ri_upload_file")); return; }
    setBusy(true); setMsg("");
    const fd = new FormData();
    fd.append("entity_id", entityId);
    fd.append("period", period);
    fd.append("file", file);
    try {
      const r: any = await riPost("/reports/upload", fd);
      setMsg(`OK: ${r.rows} ${t("ri_rows")} · v${r.version}`);
      nav(`/ri/check/${r.report_id}`);
    } catch (ex) { setMsg(String(ex)); }
    setBusy(false);
  };

  return (
    <RiShell>
    <div className="max-w-xl space-y-4">
      <div className="bg-white border border-surface-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-surface-600">{t("ri_upload_file")}</h3>
        <form onSubmit={doUpload} className="space-y-4">
          <div>
            <label className="text-xs text-surface-500">{t("ri_entity")}</label>
            <select className="ri-input" value={entityId} onChange={e => setEntityId(e.target.value)}>
              {entities.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-surface-500">{t("ri_period")}</label>
            <input className="ri-input" value={period} onChange={e => setPeriod(e.target.value)} placeholder="2026-Q3" />
          </div>
          <div>
            <label className="text-xs text-surface-500">Excel / CSV</label>
            <input type="file" accept=".xlsx,.xls,.csv" className="ri-input" onChange={e => setFile(e.target.files?.[0] || null)} />
          </div>
          <a href={`${import.meta.env.VITE_API_BASE || ""}/api/ri/template?lang=${localStorage.getItem("qyz_lang") || "kk"}`}
             className="inline-block text-sm text-brand underline">{t("ri_template")}</a>
          <button disabled={busy} className="ri-btn">{busy ? "…" : t("ri_upload")}</button>
        </form>
      </div>
      {msg && <div className="text-sm bg-surface-50 border border-surface-200 rounded-lg px-3 py-2">{msg}</div>}
    </div>
    </RiShell>
  );
}
