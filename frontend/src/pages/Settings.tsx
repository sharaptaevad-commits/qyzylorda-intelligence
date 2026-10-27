import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { Spinner, ErrorBox, SectionTitle } from "../components/ui";

const ROLE_BADGE: Record<string, string> = {
  admin: "badge-teal", analyst: "badge-pos", data_manager: "badge-warn", viewer: "badge-neutral",
};

// Seasonal metric keys (from backend stats.METRIC_KEYS)
const METRIC_KEYS = ["industry_total", "mining", "processing", "utility", "water"] as const;
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

interface SeasonalEntry {
  id: string; metric: string; region: string | null;
  active_months: number[]; nature: string; note: string;
  added_by?: string; created_at?: string;
}

export default function Settings() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const [users, setUsers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [calendar, setCalendar] = useState<SeasonalEntry[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    Promise.all([api.users(), api.settings(), api.seasonal()]).then(([u, s, sc]) => {
      setUsers(u); setSettings(s);
      setCalendar(sc.calendar || []);
      // current user is first admin? (users[0] is typically the session owner; best-effort)
      setIsAdmin(u.some((x: any) => x.role === "admin"));
    }).catch(setErr).finally(() => setLoading(false));
  }, []);

  if (err) return <ErrorBox error={err} />;
  if (loading) return <Spinner />;

  const saveAlertThresholds = async (field: string, val: string) => {
    const n = parseFloat(val);
    if (isNaN(n)) return;
    setSettings({ ...settings, [field]: n });
    try { await api.putSettings({ [field]: n }); } catch (e: any) { alert(String(e)); }
  };
  const saveAlertPP = async (val: string) => {
    const n = parseFloat(val);
    if (isNaN(n)) return;
    setSettings({ ...settings, alert_threshold_pp: n });
    try { await api.putSettings({ alert_threshold_pp: n }); } catch (e: any) { alert(String(e)); }
  };
  const toggleForecastReport = async () => {
    const next = !settings.forecast_report_enabled;
    setSettings({ ...settings, forecast_report_enabled: next });
    try { await api.putSettings({ forecast_report_enabled: next }); } catch (e: any) { alert(String(e)); }
  };
  const toggleForecastModule = async () => {
    const next = !settings.forecast_enabled;
    setSettings({ ...settings, forecast_enabled: next });
    try { await api.putSettings({ forecast_enabled: next }); } catch (e: any) { alert(String(e)); }
  };

  // ---- Seasonality calendar (admin-only) ----
  const metricLabel = (k: string) => t("rep_cat_" + k) || k; // fallback
  const saveCalendar = async (next: SeasonalEntry[]) => {
    setCalendar(next);
    try { await api.putSeasonal(next); } catch (e: any) { alert(String(e)); }
  };
  const addEntry = async () => {
    const e: SeasonalEntry = { id: "sn_" + Date.now(), metric: "processing", region: null, active_months: [4, 5, 6, 7, 8], nature: "", note: "" };
    await saveCalendar([...calendar, e]);
  };
  const updateEntry = async (i: number, patch: Partial<SeasonalEntry>) => {
    const next = calendar.map((c, j) => (j === i ? { ...c, ...patch } : c));
    await saveCalendar(next);
  };
  const removeEntry = async (i: number) => {
    await saveCalendar(calendar.filter((_, j) => j !== i));
  };
  const toggleMonth = async (i: number, m: number) => {
    const cur = new Set(calendar[i].active_months || []);
    cur.has(m) ? cur.delete(m) : cur.add(m);
    await updateEntry(i, { active_months: [...cur].sort((a, b) => a - b) });
  };

  return (
    <div className="space-y-5">
      <div className="card card-pad">
        <SectionTitle>{t("settings_users")}</SectionTitle>
        <table className="tbl">
          <thead><tr><th>{t("src_user")}</th><th>username</th><th>{t("settings_role")}</th><th>{t("settings_lang")}</th></tr></thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="text-xs">{u.username}</td>
                <td><span className={ROLE_BADGE[u.role] || "badge-neutral"}>{t("role_" + u.role) || u.role}</span></td>
                <td>{u.lang}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card card-pad">
        <SectionTitle>{t("settings_prefs")}</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center justify-between border-b border-[#F0F2F5] py-2">
            <span className="text-sm">{t("set_anomaly_pp")}</span>
            <input type="number" min={1} max={100} step={1}
              className="f-input" style={{ width: 100 }}
              value={settings.alert_threshold_pp ?? 25}
              onChange={(e) => saveAlertPP(e.target.value)} />
          </div>
          <div className="flex items-center justify-between border-b border-[#F0F2F5] py-2">
            <span className="text-sm">{t("set_anomaly_high")}</span>
            <input type="number" min={1} max={100} step={1}
              className="f-input" style={{ width: 100 }}
              value={settings.alert_threshold_high ?? 25}
              onChange={(e) => saveAlertThresholds("alert_threshold_high", e.target.value)} />
          </div>
          <div className="flex items-center justify-between border-b border-[#F0F2F5] py-2">
            <span className="text-sm">{t("set_anomaly_medium")}</span>
            <input type="number" min={1} max={100} step={1}
              className="f-input" style={{ width: 100 }}
              value={settings.alert_threshold_medium ?? 10}
              onChange={(e) => saveAlertThresholds("alert_threshold_medium", e.target.value)} />
          </div>
          <label className="flex items-center justify-between py-2 cursor-pointer">
            <span className="text-sm">{t("set_forecast_report")}</span>
            <input type="checkbox" checked={!!settings.forecast_report_enabled} onChange={toggleForecastReport} />
          </label>
          <label className="flex items-center justify-between py-2 cursor-pointer">
            <span className="text-sm">{t("set_forecast_module")}</span>
            <input type="checkbox" checked={!!settings.forecast_enabled} onChange={toggleForecastModule} />
          </label>
        </div>
      </div>

      {/* Seasonality calendar (admin only) */}
      {isAdmin && (
        <div className="card card-pad">
          <SectionTitle>{t("seasonal_title")}</SectionTitle>
          <p className="text-xs text-surface-500 mb-3">{t("seasonal_desc")}</p>
          {calendar.length === 0 ? (
            <div className="text-sm text-surface-400 bg-surface-50 border border-surface-200 rounded-lg p-3">{t("seasonal_empty")}</div>
          ) : (
            <div className="space-y-3">
              {calendar.map((c, i) => (
                <div key={c.id} className="border border-[#E3E8F0] rounded-lg p-3 bg-white">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                    <select className="f-input" value={c.metric} onChange={(e) => updateEntry(i, { metric: e.target.value })}>
                      {METRIC_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                    <input className="f-input" placeholder={t("seasonal_region")} value={c.region || ""} onChange={(e) => updateEntry(i, { region: e.target.value || null })} />
                    <input className="f-input" placeholder={t("seasonal_nature")} value={c.nature} onChange={(e) => updateEntry(i, { nature: e.target.value })} />
                    <input className="f-input" placeholder={t("seasonal_note")} value={c.note} onChange={(e) => updateEntry(i, { note: e.target.value })} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-surface-500 mr-1">{t("seasonal_active_months")}:</span>
                    {MONTHS.map((m) => (
                      <button key={m} onClick={() => toggleMonth(i, m)}
                        className={`w-7 h-7 rounded text-xs font-semibold border transition-colors ${
                          (c.active_months || []).includes(m)
                            ? "bg-[#1F5FE0] text-white border-[#1F5FE0]"
                            : "bg-white text-surface-500 border-surface-200 hover:bg-surface-50"}`}
                        title={String(m)}>{m}</button>
                    ))}
                    <button onClick={() => removeEntry(i)} className="ml-auto text-xs font-semibold text-rose-600 hover:text-rose-700 px-2 py-1">
                      {t("seasonal_remove")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-3">
            <button onClick={addEntry} className="text-sm font-semibold text-[#1F5FE0] hover:text-[#0B3FA8]">
              + {t("seasonal_add")}
            </button>
            <span className="text-[11px] text-surface-400">{t("seasonal_needs_years")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
