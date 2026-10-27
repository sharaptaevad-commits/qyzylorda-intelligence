// Report Intake — Check result (error list + status actions) (Phase 1).
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { riGet, riPost, type RiReport, type RiFinding } from "./types";
import { FindingTable, StatusBadge } from "./components";
import { useNavigate, useParams } from "react-router-dom";
import RiShell from "./Shell";

export default function RiCheckResult() {
  const { t } = useTranslation();
  const { reportId } = useParams();
  const nav = useNavigate();
  const [rep, setRep] = useState<RiReport | null>(null);
  const [errors, setErrors] = useState<RiFinding[]>([]);
  const [warnings, setWarnings] = useState<RiFinding[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => riGet<{ reports: RiReport[] }>("/reports").then(d => {
    const r = d.reports.find(x => x.id === reportId);
    if (r) setRep(r);
  }).catch(() => {});
  useEffect(() => { load(); }, [reportId]);

  if (!rep) return <div className="text-center text-surface-500 py-16">…</div>;

  const check = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await riPost<{ errors: RiFinding[]; warnings: RiFinding[]; status: string }>(`/reports/${reportId}/check`, {});
      setErrors(r.errors); setWarnings(r.warnings);
      load();
    } catch (ex) { setMsg(String(ex)); }
    setBusy(false);
  };

  const act = async (p: "accept" | "return") => {
    setBusy(true);
    try { await riPost(`/reports/${reportId}/${p}`, {}); load(); nav("/ri"); }
    catch (ex) { setMsg(String(ex)); }
    setBusy(false);
  };

  return (
    <RiShell hideNav>
    <div className="space-y-4">
      <div className="bg-white border border-surface-200 rounded-xl px-4 py-3 flex items-center gap-3">
        <StatusBadge status={rep.status} t={t} />
        <span className="text-sm text-surface-600">{rep.period} · v{rep.versions.length}</span>
        <div className="ml-auto flex gap-2">
          <button onClick={check} disabled={busy} className="ri-btn">{t("ri_check")}</button>
          <button onClick={() => act("accept")} disabled={busy} className="ri-btn ri-btn-emerald">{t("ri_accept")}</button>
          <button onClick={() => act("return")} disabled={busy} className="ri-btn ri-btn-rose">{t("ri_return")}</button>
        </div>
      </div>

      <FindingTable title={t("ri_errors")} items={errors} t={t} tone="error" />
      <FindingTable title={t("ri_warnings")} items={warnings} t={t} tone="warning" />
      {msg && <div className="text-sm text-rose-600">{msg}</div>}
    </div>
    </RiShell>
  );
}
