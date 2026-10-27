import React, { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart3, Factory, Cpu, Map, Search, Globe, ChevronDown, User,
  TrendingUp, Bell, FileText, Database, Menu, X, Settings, Bot, LogOut,
  Layers, Info
} from "lucide-react";
import { getUser, setAuth } from "../api";
import { setLang } from "../i18n";
import { useReportIntakeEnabled } from "../modules/report-intake/useFlag";
import { useSettingFlag } from "../useSettingsFlag";

const LANGS = [
  { code: "kk", label: "Қазақша" },
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
];

const ROLE_LABEL: Record<string, string> = { admin: "role_admin", analyst: "role_analyst", data_manager: "role_data_manager", viewer: "role_viewer" };

// Top-level menu definition (maps old 12 sidebar sections to the new top nav)
const MENU = [
  { key: "nav_home", to: "/", end: true, icon: HomeIcon },
  { key: "nav_metrics", children: [
    { to: "/industrial", key: "nav_industrial", icon: Factory },
    { to: "/manufacturing", key: "nav_manufacturing", icon: Cpu },
    { to: "/district", key: "nav_district", icon: Map },
  ]},
  { key: "nav_alerts", to: "/alerts", icon: Bell },
  { key: "nav_reports", children: [
    { to: "/reports", key: "nav_reports", icon: FileText },
    { to: "/compare", key: "nav_compare", icon: Layers },
  ]},
  { key: "nav_data", children: [
    { to: "/data", key: "nav_data", icon: Database },
    { to: "/documents", key: "nav_documents", icon: FileText },
    { to: "/sources", key: "nav_sources", icon: Info },
  ]},
];

function HomeIcon(props: any) { return <BarChart3 {...props} />; }

export default function TopNav({ onLogin }: { onLogin?: (t: string, u: any) => void }) {
  const { t, i18n } = useTranslation();
  const loc = useLocation();
  const nav = useNavigate();
  const user = getUser();
  const lang = i18n.language.slice(0, 2);
  const [openDrop, setOpenDrop] = useState<string | null>(null);
  const [userMenu, setUserMenu] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as any)) { setOpenDrop(null); setUserMenu(false); } }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const isActive = (to: string, end?: boolean) => end ? loc.pathname === to : loc.pathname.startsWith(to);
  const groupActive = (g: any) => g.children?.some((c: any) => isActive(c.to));

  // Report Intake module: append its top-level item only when the feature flag is on.
  const { enabled: riEnabled } = useReportIntakeEnabled();
  const { enabled: forecastEnabled } = useSettingFlag("forecast_enabled");
  const menu = (() => {
    let m = MENU;
    if (forecastEnabled) m = [...m, { key: "nav_forecasts", to: "/forecast", icon: TrendingUp } as any];
    if (riEnabled) m = [...m, { key: "ri_nav", to: "/ri", icon: FileText } as any];
    return m;
  })();

  if (!user) return null;

  function doSearch() {
    if (!q.trim()) return;
    // navigate to district search as a practical default (indicators page)
    nav(`/industrial?q=${encodeURIComponent(q)}`);
  }

  const logo = (
    <div className="flex items-center gap-2.5 px-4 h-full">
      <div className="w-9 h-9 rounded-lg bg-[#1F5FE0] flex items-center justify-center shrink-0">
        <BarChart3 className="w-5 h-5 text-white" aria-hidden />
      </div>
      <div className="leading-tight hidden sm:block">
        <div className="text-[13px] font-bold text-[#0F2A4A]">{t("org_line1")}</div>
        <div className="text-[11px] text-txt2">{t("org_line2")}</div>
      </div>
    </div>
  );

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[#E3E8F0]" ref={ref}>
      <div className="flex items-center h-16 px-3 sm:px-5 gap-2">
        {logo}

        {/* Desktop menu */}
        <nav className="hidden lg:flex items-center gap-0.5 ml-4 flex-1">
          {menu.map((item) => (
            <div key={item.key} className="relative">
              {item.children ? (
                <>
                  <button
                    onClick={() => setOpenDrop(openDrop === item.key ? null : item.key)}
                    className={`flex items-center gap-1 ${groupActive(item) ? "nav-link-active" : "nav-link"}`}>
                    {t(item.key)} <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openDrop === item.key ? "rotate-180" : ""}`} />
                  </button>
                  {openDrop === item.key && (
                    <div className="absolute top-full left-0 pt-1 w-60">
                      <div className="card p-1.5 shadow-card-hover">
                        {item.children.map((c: any) => (
                          <NavLink key={c.to} to={c.to} className={isActive(c.to) ? "nav-dropdown-item-active" : "nav-dropdown-item"}
                            onClick={() => setOpenDrop(null)}>
                            <c.icon className="w-4 h-4" aria-hidden /> {t(c.key)}
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <NavLink to={item.to} end={item.end} className={isActive(item.to, item.end) ? "nav-link-active" : "nav-link"}>
                  {t(item.key)}
                </NavLink>
              )}
            </div>
          ))}
          {/* AI analyst standalone button */}
          <NavLink to="/ai" className={`${isActive("/ai") ? "nav-link-active" : "nav-link"} !bg-[#E8F0FE] !text-[#1F5FE0]`}>
            <Bot className="w-4 h-4 inline mr-1" aria-hidden /> {t("nav_ai_btn")}
          </NavLink>
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Search */}
          <div className="hidden md:flex items-center bg-[#F3F6FB] rounded-full px-3 py-1.5 border border-transparent focus-within:border-[#1F5FE0] focus-within:bg-white transition">
            <Search className="w-4 h-4 text-txt2 mr-2" aria-hidden />
            <input className="bg-transparent text-sm outline-none w-32 placeholder:text-txt2"
              placeholder={t("search_placeholder")} value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === "Enter" && doSearch()} aria-label={t("search")} />
          </div>

          {/* Language */}
          <div className="relative">
            <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-[#F3F6FB] text-sm font-medium text-[#0F2A4A]"
              onClick={() => setOpenDrop(openDrop === "lang" ? null : "lang")}>
              <Globe className="w-4 h-4" aria-hidden />
              <span className="hidden sm:inline">{LANGS.find(l => l.code === lang)?.label}</span>
              <ChevronDown className="w-3.5 h-3.5" aria-hidden />
            </button>
            {openDrop === "lang" && (
              <div className="absolute top-full right-0 pt-1 w-36 z-50">
                <div className="card p-1.5 shadow-card-hover">
                  {LANGS.map(l => (
                    <button key={l.code} onClick={() => { setLang(l.code); setOpenDrop(null); }}
                      className={`w-full text-left px-3 py-1.5 rounded-md text-sm ${lang === l.code ? "bg-[#E8F0FE] text-[#1F5FE0] font-semibold" : "hover:bg-[#F3F6FB]"}`}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User */}
          <div className="relative">
            <button onClick={() => setUserMenu(!userMenu)} className="flex items-center gap-2 pl-1 pr-1.5 py-1 rounded-full hover:bg-[#F3F6FB]" aria-label={t("profile")}>
              <div className="w-8 h-8 rounded-full bg-[#1F5FE0] text-white flex items-center justify-center">
                <User className="w-4 h-4" aria-hidden />
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-txt2 hidden sm:block" aria-hidden />
            </button>
            {userMenu && (
              <div className="absolute top-full right-0 pt-1 w-52 z-50">
                <div className="card p-1.5 shadow-card-hover">
                  <div className="px-3 py-2 border-b border-[#E3E8F0] mb-1">
                    <div className="text-sm font-semibold text-[#0F2A4A]">{user.name}</div>
                    <div className="text-[11px] text-txt2">{t(ROLE_LABEL[user.role] || user.role)}</div>
                  </div>
                  {user.role === "admin" && (
                    <button className="nav-dropdown-item" onClick={() => { nav("/settings"); setUserMenu(false); }}>
                      <Settings className="w-4 h-4" aria-hidden /> {t("nav_settings")}
                    </button>
                  )}
                  <button className="nav-dropdown-item" onClick={() => { setAuth(null, null); }}>
                    <LogOut className="w-4 h-4" aria-hidden /> {t("logout")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button className="lg:hidden p-2 rounded-lg hover:bg-[#F3F6FB]" onClick={() => setMobile(!mobile)} aria-label="menu">
            {mobile ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobile && (
        <div className="lg:hidden border-t border-[#E3E8F0] bg-white px-3 py-2 max-h-[70vh] overflow-y-auto">
          {menu.map((item) => (
            <div key={item.key} className="py-1">
              {item.children ? (
                <>
                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-txt2">{t(item.key)}</div>
                  {item.children.map((c: any) => (
                    <NavLink key={c.to} to={c.to} onClick={() => setMobile(false)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ${isActive(c.to) ? "bg-[#E8F0FE] text-[#1F5FE0] font-semibold" : "text-[#475569]"}`}>
                      <c.icon className="w-4 h-4" aria-hidden /> {t(c.key)}
                    </NavLink>
                  ))}
                </>
              ) : (
                <NavLink to={item.to} end={item.end} onClick={() => setMobile(false)}
                  className={`block px-3 py-2 rounded-lg text-sm ${isActive(item.to, item.end) ? "bg-[#E8F0FE] text-[#1F5FE0] font-semibold" : "text-[#475569]"}`}>
                  {t(item.key)}
                </NavLink>
              )}
            </div>
          ))}
          <NavLink to="/ai" onClick={() => setMobile(false)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[#1F5FE0] font-semibold">
            <Bot className="w-4 h-4" aria-hidden /> {t("nav_ai_btn")}
          </NavLink>
        </div>
      )}
    </header>
  );
}
