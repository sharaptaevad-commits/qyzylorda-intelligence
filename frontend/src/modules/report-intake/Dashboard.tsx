// Report Intake — Monitoring dashboard (independent module, Phase 1).
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { riGet, type RiEntity, type RiReport, type RiStatus } from "./types";
import RiShell from "./Shell";
import { StatusBadge, statusKey } from "./components";

export default function RiDashboard() {
  const { t } = useTranslation();
  const [entities, setEntities] = useState<RiEntity[]>([]);
  const [allReports, setAllReports] = useState<RiReport[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    riGet<{ entities: RiEntity[] }>("/entities").then(d => setEntities(d.entities)).catch(e => setErr(e.message));
    riGet<{ reports: RiReport[] }>("/reports").then(d => setAllReports(d.reports || [])).catch(() => {});
  }, []);

  if (err === "ri_disabled") {
    return <div className="text-center text-surface-500 py-16">{t("ri_module_disabled")}</div>;
  }

  const byStatus = (s: RiStatus) => allReports.filter(r => r.status === s).length;
  const accepted = byStatus("accepted") + byStatus("sent");
  const total = allReports.length;
  const ready = total ? Math.round((accepted / total) * 100) : 0;

  return (
    <RiShell>
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label={t("ri_ready_pct")} value={`${ready}%`} tone="emerald" />
        <Kpi label={t("ri_st_needs_fix")} value={String(byStatus("needs_fix"))} tone="rose" />
        <Kpi label={t("ri_late")} value={String(allReports.filter(r => isLate(r)).length)} tone="amber" />
        <Kpi label={t("ri_entities")} value={String(entities.length)} tone="sky" />
      </div>

      <div className="bg-white border border-surface-200 rounded-xl">
        <div className="px-4 py-2.5 border-b border-surface-100 text-sm font-semibold">{t("ri_status")} · {t("ri_entities")}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-surface-500 border-b border-surface-100">
                <th className="px-4 py-2">{t("ri_entity")}</th>
                <th className="px-4 py-2">{t("ri_person")}</th>
                <th className="px-4 py-2">{t("ri_deadline")}</th>
              </tr>
            </thead>
            <tbody>
              {entities.map(e => (
                <tr key={e.id} className="border-b border-surface-50">
                  <td className="px-4 py-2 font-medium">{e.name}</td>
                  <td className="px-4 py-2 text-surface-600">{e.person || "—"}</td>
                  <td className="px-4 py-2 tabular-nums">{e.deadline || "—"}</td>
                </tr>
              ))}
              {entities.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-surface-400">—</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </RiShell>
  );
}

function isLate(r: RiReport): boolean {
  void r;
  return false; // phase-1: deadline check is surfaced in findings, not dashboard count
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: "emerald" | "rose" | "amber" | "sky" }) {
  const cls = { emerald: "text-emerald-600", rose: "text-rose-600", amber: "text-amber-600", sky: "text-sky-600" }[tone];
  return (
    <div className="bg-white border border-surface-200 rounded-xl px-4 py-3">
      <div className="text-xs text-surface-500">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
