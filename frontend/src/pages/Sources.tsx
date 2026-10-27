import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { Spinner, SectionTitle, Empty } from "../components/ui";

// Defensive date formatting: never throws if ts is missing/invalid.
function fmtTs(ts: any, lang: string): string {
  if (ts == null) return "—";
  const n = Number(ts);
  if (!isFinite(n)) return "—";
  const d = new Date(n * 1000);
  if (isNaN(d.getTime())) return "—";
  try { return d.toLocaleString(lang); } catch { return "—"; }
}

// Status badge: official (ministry) vs institutional (org report) vs unknown.
function SrcStatus({ status, t }: { status?: string; t: (k: string) => string }) {
  const s = status || "unverified";
  const official = s === "verified" || s === "official" || s === "done";
  const cls = official ? "badge-pos" : "badge-neutral";
  const label = official ? t("badge_official") : t("src_org_report");
  return <span className={cls}>{label}</span>;
}

export default function Sources() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const [sources, setSources] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [err, setErr] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    // Each call fails independently so one bad endpoint doesn't blank the page.
    Promise.allSettled([api.sources(), api.audit(50)]).then(([sr, ar]) => {
      if (sr.status === "fulfilled") setSources(Array.isArray(sr.value) ? sr.value : []);
      else setSources([]);
      if (ar.status === "fulfilled") setAudit(Array.isArray(ar.value) ? ar.value : []);
      else setAudit([]);
      // Treat as error only if BOTH failed.
      if (sr.status === "rejected" && ar.status === "rejected") setErr(true);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;

  if (err) {
    return (
      <div className="card card-pad">
        <SectionTitle>{t("sources_title")}</SectionTitle>
        <div className="text-sm text-rose-600">{t("err_load_failed")}</div>
        <button onClick={load} className="mt-3 text-sm font-semibold text-[#1F5FE0] hover:text-[#0B3FA8]">
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="card card-pad">
        <SectionTitle>{t("sources_title")}</SectionTitle>
        {sources.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("src_doc")}</th>
                  <th>{t("src_org")}</th>
                  <th>{t("src_date")}</th>
                  <th>{t("src_who")}</th>
                  <th>{t("src_status_label")}</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s: any, i: number) => (
                  <tr key={s.sha256 || i}>
                    <td className="text-xs">{s.doc || "—"}</td>
                    <td>{s.org || "—"}</td>
                    <td className="text-xs">{fmtTs(s.ts, lang)}</td>
                    <td className="text-xs">{s.user || "—"}</td>
                    <td><SrcStatus status={s.status} t={t} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text={t("sources_empty")} />
        )}
      </div>

      <div className="card card-pad">
        <SectionTitle>{t("data_history")}</SectionTitle>
        {audit.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("src_date")}</th>
                  <th>{t("src_action")}</th>
                  <th>{t("src_who")}</th>
                  <th>{t("src_detail")}</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a: any, i: number) => (
                  <tr key={i}>
                    <td className="text-xs">{fmtTs(a.ts, lang)}</td>
                    <td className="text-xs"><span className="badge-neutral">{a.action || "—"}</span></td>
                    <td className="text-xs">{a.user || "—"}</td>
                    <td className="text-xs text-txt2">{a.detail || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text={t("empty_state")} />
        )}
      </div>
    </div>
  );
}
