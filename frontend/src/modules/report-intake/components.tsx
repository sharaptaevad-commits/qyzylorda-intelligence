// Report Intake module — small shared UI pieces (independent module).
import type { RiStatus } from "./types";

const STATUS_COLOR: Record<RiStatus, string> = {
  pending: "bg-slate-100 text-slate-700",
  uploaded: "bg-sky-100 text-sky-700",
  checking: "bg-amber-100 text-amber-700",
  needs_fix: "bg-rose-100 text-rose-700",
  accepted: "bg-emerald-100 text-emerald-700",
  sent: "bg-indigo-100 text-indigo-700",
};

export function statusKey(s: string): string {
  return "ri_st_" + s;
}

export function StatusBadge({ status, t }: { status: RiStatus; t: (k: string) => string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[status] || "bg-slate-100 text-slate-600"}`}>
      {t(statusKey(status))}
    </span>
  );
}

export function FindingTable({ title, items, t, tone }: {
  title: string; items: any[]; t: (k: string) => string; tone: "error" | "warning";
}) {
  const toneCls = tone === "error" ? "text-rose-600" : "text-amber-600";
  return (
    <div className="bg-white border border-surface-200 rounded-xl">
      <div className="px-4 py-2.5 border-b border-surface-100 flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <span className={`text-sm font-bold ${toneCls}`}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-surface-500">{t(tone === "error" ? "ri_no_errors" : "ri_no_warnings")}</div>
      ) : (
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-surface-500 border-b border-surface-100">
                <th className="px-4 py-2 w-16">{t("ri_row")}</th>
                <th className="px-4 py-2">{t("ri_col")}</th>
                <th className="px-4 py-2">{t("ri_issue")}</th>
                <th className="px-4 py-2">{t("ri_expected")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((f, i) => (
                <tr key={i} className="border-b border-surface-50">
                  <td className="px-4 py-2 tabular-nums">{f.row}</td>
                  <td className="px-4 py-2">{f.column}</td>
                  <td className={`px-4 py-2 ${toneCls}`}>{f.message}</td>
                  <td className="px-4 py-2 text-surface-600">{f.expected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
