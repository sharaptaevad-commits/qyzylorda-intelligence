// Report Intake module — page shell with internal sub-navigation (Phase 1).
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";

const ITEMS = [
  { to: "/ri", key: "ri_dashboard", end: true },
  { to: "/ri/entities", key: "ri_entities", end: false },
  { to: "/ri/upload", key: "ri_upload", end: false },
  { to: "/ri/merged", key: "ri_merged", end: false },
  { to: "/ri/history", key: "ri_history", end: false },
];

function cn(active: boolean, base: string): string {
  return base + (active ? " text-brand border-brand" : " text-surface-500 border-transparent hover:text-surface-700");
}

export default function RiShell({ children, hideNav = false }: { children: React.ReactNode; hideNav?: boolean }) {
  const { t } = useTranslation();
  const loc = useLocation();
  return (
    <div className="space-y-5">
      {!hideNav && (
        <div className="flex flex-wrap gap-1 border-b border-surface-200">
          {ITEMS.map(it => (
            <NavLink key={it.to} to={it.to} end={it.end}
              className={cn(loc.pathname === it.to, "px-3 py-2 text-sm font-medium border-b-2 -mb-px")}>
              {t(it.key)}
            </NavLink>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
