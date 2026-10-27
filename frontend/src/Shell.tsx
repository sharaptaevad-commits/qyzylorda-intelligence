import React, { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, getUser, setAuth } from "./api";
import { setLang } from "./i18n";
import TopNav from "./components/TopNav";
import { BarChart3 } from "lucide-react";

// Breadcrumb title per route
const TITLES: Record<string, string> = {
  "/": "dash_title", "/industrial": "industrial_title", "/manufacturing": "mfg_title",
  "/district": "district_title", "/forecast": "forecast_title", "/documents": "doc_title",
  "/compare": "cmp_title", "/ai": "ai_title", "/reports": "reports_title",
  "/data": "data_title", "/sources": "sources_title", "/settings": "settings_title", "/alerts": "alerts_title",
};

function Login({ onLogin }: { onLogin: (t: string, u: any) => void }) {
  const { t } = useTranslation();
  const [u, setU] = useState("admin"); const [p, setP] = useState("admin");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const isDev = import.meta.env.DEV;
  async function go() {
    setBusy(true); setErr("");
    try { const r = await api.login(u, p); onLogin(r.token, r.user); }
    catch { setErr(t("login_error")); } finally { setBusy(false); }
  }
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left: hero photo (overlay), gradient fallback */}
      <div className="hidden lg:flex flex-col justify-between p-10 text-white relative overflow-hidden">
        <img src="/assets/hero.jpg" alt="" width={1440} height={1000}
          loading="eager" decoding="async" className="absolute inset-0 w-full h-full object-cover object-center" />
        <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(120deg, rgba(11,63,168,0.92) 0%, rgba(31,95,224,0.78) 55%, rgba(31,95,224,0.35) 100%)" }} />
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center"><BarChart3 className="w-5 h-5" aria-hidden /></div>
          <div>
            <div className="font-bold">{t("org_line1")}</div>
            <div className="text-xs text-white/70">{t("org_line2")}</div>
          </div>
        </div>
        <div className="relative z-10">
          <h1 className="text-3xl font-bold leading-tight max-w-md drop-shadow-sm">{t("hero_title")}</h1>
          <p className="mt-4 text-white/85 max-w-md drop-shadow-sm">{t("hero_subtitle")}</p>
        </div>
        <div className="relative z-10 text-xs text-white/60">© {new Date().getFullYear()} {t("org_line2")}</div>
      </div>
      {/* Right: login card */}
      <div className="flex items-center justify-center p-6 bg-[#F3F6FB]">
        <div className="w-full max-w-sm">
          <div className="card card-pad p-7">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-[#0F2A4A]">{t("login")}</h2>
              <p className="text-sm text-txt2 mt-1">{t("org_line1")}</p>
            </div>
            <label className="lbl block mb-1">{t("username")}</label>
            <input className="input mb-4" value={u} onChange={e => setU(e.target.value)} autoFocus />
            <label className="lbl block mb-1">{t("password")}</label>
            <input className="input mb-4" type="password" value={p} onChange={e => setP(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} />
            {err && <div className="text-[#DC2626] text-sm mb-3">{err}</div>}
            <button className="btn-primary w-full" onClick={go} disabled={busy}>{t("login")}</button>
            {isDev && <div className="text-[11px] text-txt2 mt-4 text-center">{t("demo_accounts")}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Shell() {
  const { t } = useTranslation();
  const loc = useLocation();
  const user = getUser();

  if (!user) return <Login onLogin={(t2, u2) => { setAuth(t2, u2); }} />;

  const seg = loc.pathname.replace(/\/$/, "") || "/";
  const titleKey = TITLES[seg] || TITLES[Object.keys(TITLES).find(k => k !== "/" && seg.startsWith(k)) || "/"];

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
        <div className="mb-5">
          <div className="text-[11px] text-txt2 mb-0.5">{t("breadcrumb_home")} · {t("app_title")}</div>
          <h1 className="text-xl font-bold text-[#0F2A4A]">{t(titleKey)}</h1>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
