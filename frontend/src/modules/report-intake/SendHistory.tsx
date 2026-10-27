// Report Intake — Send / audit history (independent module, Phase 1).
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { riGet, type RiAudit } from "./types";
import RiShell from "./Shell";

export default function RiHistory() {
  const { t } = useTranslation();
  const [items, setItems] = useState<RiAudit[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    riGet<{ audit: RiAudit[] }>("/history").then(d => setItems(d.audit)).catch(e => setErr(e.message));
  }, []);

  if (err === "ri_disabled") return <div className="text-center text-surface-500 py-16">{t("ri_module_disabled")}</div>;

  return (
    <RiShell>
    <div className="bg-white border border-surface-200 rounded-xl overflow-x-auto">
      <div className="px-4 py-2.5 border-b border-surface-100 text-sm font-semibold">{t("ri_audit")}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-surface-500 border-b border-surface-100">
            <th className="px-4 py-2">{t("ri_action")}</th>
            <th className="px-4 py-2">{t("ri_user")}</th>
            <th className="px-4 py-2">{t("ri_when")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map(a => (
            <tr key={a.id} className="border-b border-surface-50">
              <td className="px-4 py-2">{a.action}</td>
              <td className="px-4 py-2 text-surface-600">{a.user || "—"}</td>
              <td className="px-4 py-2 tabular-nums">{a.ts ? new Date(a.ts * 1000).toLocaleString() : "—"}</td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-surface-400">—</td></tr>}
        </tbody>
      </table>
    </div>
    </RiShell>
  );
}
