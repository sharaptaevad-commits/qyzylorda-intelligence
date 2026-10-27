// Report Intake — Merged table + plain Excel export (Phase 1, NOT Astana format).
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { riGet, RIAPI } from "./types";
import RiShell from "./Shell";

export default function RiMerged() {
  const { t } = useTranslation();
  const [data, setData] = useState<{ columns: string[]; rows: Record<string, unknown>[]; count: number } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    riGet<any>("/merged").then(setData).catch(e => setErr(e.message));
  }, []);

  if (err === "ri_disabled") return <div className="text-center text-surface-500 py-16">{t("ri_module_disabled")}</div>;
  if (!data) return <div className="text-center text-surface-500 py-16">…</div>;

  const exportUrl = `${RIAPI}/api/ri/export?lang=${localStorage.getItem("qyz_lang") || "kk"}`;

  return (
    <RiShell>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-surface-600">{t("ri_merged")} · {data.count}</h3>
        <a href={exportUrl} className="ri-btn">{t("ri_export")}</a>
      </div>
      <p className="text-xs text-surface-400 -mt-2">{t("ri_export_note")}</p>
      <div className="bg-white border border-surface-200 rounded-xl overflow-x-auto max-h-[60vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left text-surface-500 border-b border-surface-100">
              {data.columns.map(c => <th key={c} className="px-4 py-2">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={i} className="border-b border-surface-50">
                {data.columns.map(c => <td key={c} className="px-4 py-2 tabular-nums">{String((r as any)[c] ?? "")}</td>)}
              </tr>
            ))}
            {data.rows.length === 0 && <tr><td colSpan={data.columns.length} className="px-4 py-8 text-center text-surface-400">—</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
    </RiShell>
  );
}
