import React from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, ArrowDownRight, AlertTriangle, Inbox, Loader2, Clock } from "lucide-react";

export function Spinner() {
  return <div className="flex items-center gap-2 text-txt2 py-10 justify-center">
    <Loader2 className="w-4 h-4 animate-spin text-brand" />
    <span className="text-sm">…</span>
  </div>;
}

export function Empty({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return <div className="flex flex-col items-center justify-center text-txt2 py-12 text-sm gap-2">
    <span className="text-3xl opacity-40">{icon ?? "📊"}</span>
    {text}
  </div>;
}

export function ErrorBox({ error, onRetry }: { error: any; onRetry?: () => void }) {
  const { t } = useTranslation();
  // NetworkError (server unreachable) -> localized "server unavailable" + retry.
  const isNetwork = error instanceof Error && (error as any).isNetwork === true;
  let msg: string;
  if (isNetwork) {
    msg = t("err_server_unavailable");
  } else if (typeof error === "string") {
    // Raw strings like "Failed to fetch" should not be shown as-is.
    msg = /failed to fetch|networkerror|load failed|no internet/i.test(error) ? t("err_server_unavailable") : error;
  } else {
    msg = error?.detail?.message || error?.message || (error?.status ? t("err_generic") : t("err_generic"));
    if (error?.status && /undefined|\[object Object\]/.test(String(msg))) msg = t("err_generic");
  }
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 bg-[#FDECEC] border border-[#DC2626]/30 text-[#DC2626] rounded-lg px-4 py-3 text-sm">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
      <span className="flex-1">{msg}</span>
      {(onRetry || isNetwork) && (
        <button onClick={() => (onRetry ? onRetry() : window.location.reload())} className="f-btn f-btn-ghost !text-[#DC2626] !border-[#DC2626]/40 shrink-0 text-xs">
          {t("err_retry")}
        </button>
      )}
    </div>
  );
}

// Locale-aware number formatting (decimal comma for kk/ru, grouping separator)
export function useFmt() {
  const { i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const locale = lang === "kk" ? "kk-KZ" : lang === "ru" ? "ru-RU" : "en-US";
  return {
    locale,
    num(v: any, digits = 1): string {
      if (v === null || v === undefined) return "—";
      const n = Number(v);
      if (Number.isNaN(n)) return String(v);
      return new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
    },
    compact(v: any): string {
      if (v === null || v === undefined) return "—";
      const n = Number(v);
      if (Number.isNaN(n)) return String(v);
      return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);
    },
  };
}

export function fmtNum(v: any): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const map: Record<string, [string, string]> = {
    uploaded: ["badge-neutral", "status_uploaded"], processing: ["badge-warn", "status_processing"],
    review: ["badge-warn", "status_review"], done: ["badge-pos", "status_done"], error: ["badge-neg", "status_error"],
    verified: ["badge-pos", "status_verified"], unverified: ["badge-neutral", "status_unverified"],
    forecast: ["badge-forecast", "status_forecast"], new: ["badge-brand", "status_new"],
  };
  const [cls, key] = map[status] || ["badge-neutral", status];
  return <span className={cls}>{t(key) || status}</span>;
}

export function DeltaBadge({ value, suffix = "%", caption, noCompareLabel }: { value: number | null; suffix?: string; caption?: string; noCompareLabel?: string }) {
  if (value === null || value === undefined) {
    return <div className="text-right"><div className="text-[11px] text-txt2">{noCompareLabel || "—"}</div></div>;
  }
  const up = value >= 0;
  return (
    <div className="text-right">
      <div className={`inline-flex items-center gap-0.5 font-bold ${up ? "text-[#16A34A]" : "text-[#DC2626]"}`}>
        {up ? <ArrowUpRight className="w-3.5 h-3.5" aria-label="up" /> : <ArrowDownRight className="w-3.5 h-3.5" aria-label="down" />}
        {Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}{suffix}
      </div>
      {caption ? <div className="text-[10px] text-txt2 -mt-0.5">{caption}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, right, icon }: { children: React.ReactNode; right?: React.ReactNode; icon?: React.ReactNode }) {
  return <div className="flex items-center justify-between mb-4">
    <h2 className="section-title">{icon}<span>{children}</span></h2>
    {right}
  </div>;
}

export function KpiCard({ title, value, unit, icon, change, changeSuffix, changeCaption, periodLabel, source, status,
  spark, tone, showEmpty }: {
  title: string; value: any; unit?: string | null; icon: React.ReactNode;
  change?: number | null | undefined; changeSuffix?: string; changeCaption?: string; periodLabel?: string; source?: string | null;
  status?: string; spark?: number[]; tone?: string; showEmpty?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.slice(0, 2) === "kk" ? "kk-KZ" : i18n.language.slice(0, 2) === "ru" ? "ru-RU" : "en-US";
  if (value === null || value === undefined) {
    return (
      <div className="card card-pad opacity-70 h-full flex flex-col">
        <div className="flex items-center gap-3">
          <div className="icon-badge opacity-60">{icon}</div>
          <div className="lbl">{title}</div>
        </div>
        <div className="mt-4 text-lg font-semibold text-txt2">{showEmpty ? t("no_data_imported") : "—"}</div>
        {source && <div className="text-[10px] text-txt2 mt-2 truncate">{source}</div>}
      </div>
    );
  }
  const display = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Number(value));
  const hasSpark = !!spark && spark.length >= 2;
  const hasChange = change !== null && change !== undefined;
  const up = (change ?? 0) >= 0;
  return (
    <div className="card card-hover card-pad flex flex-col h-full" title={source || title}>
      {/* header: icon + title (left), verified badge (top-right) */}
      <div className="flex items-start gap-3">
        <div className="icon-badge shrink-0">{icon}</div>
        <div className="lbl min-w-0 flex-1 truncate" title={title}>{title}</div>
        {status && <div className="shrink-0 -mt-0.5"><StatusBadge status={status} /></div>}
      </div>

      {/* value + unit (nowrap) */}
      <div className="mt-3 flex items-baseline gap-1 whitespace-nowrap">
        <span className="text-[30px] leading-none font-bold text-[#0F2A4A] tracking-tight">{display}</span>
        {unit && <span className="text-sm font-medium text-txt2">{unit}</span>}
      </div>

      {/* change row: arrow + value + explanation (or precise reason) */}
      <div className="mt-1.5 h-[30px] flex flex-col justify-center">
        {hasChange ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-0.5 font-bold ${up ? "text-[#16A34A]" : "text-[#DC2626]"}`}>
              {up ? <ArrowUpRight className="w-3.5 h-3.5" aria-hidden /> : <ArrowDownRight className="w-3.5 h-3.5" aria-hidden />}
              <span className="whitespace-nowrap">{Math.abs(change).toLocaleString(locale, { maximumFractionDigits: 1 })}{changeSuffix ?? "%"}</span>
            </span>
            {changeCaption && <span className="text-[10px] text-txt2">{changeCaption}</span>}
          </div>
        ) : (
          <div className="text-[11px] text-txt2">{t("no_compare_period")}</div>
        )}
      </div>

      {/* bottom: sparkline (real series) OR mini two-bar (2026 vs prior), fills the space */}
      <div className="mt-auto pt-2">
        {hasSpark
          ? <Sparkline data={spark} tone={tone} />
          : <MiniCompare hasPrior={hasChange} up={up} change={change ?? 0} label={periodLabel} />}
      </div>

      {/* period footnote */}
      {periodLabel && <div className="text-[10px] text-txt2 mt-1.5">{periodLabel}</div>}
    </div>
  );
}

// Two mini bars (current vs prior year) when there is no real series to spark.
// Purely visual, derived from the same two values shown in the change row.
function MiniCompare({ hasPrior, up, change, label }: { hasPrior: boolean; up: boolean; change: number; label?: string }) {
  if (!hasPrior) {
    return <div className="flex items-center gap-1.5 text-[11px] text-txt2 h-[40px]">
      <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden /> {label || "—"}
    </div>;
  }
  const mag = Math.min(Math.abs(change), 20); // clamp visual height
  const h1 = 18 + (mag / 20) * 16;           // prior (baseline) shorter
  const h2 = up ? h1 + 10 : Math.max(8, h1 - 10); // current
  return (
    <div className="flex items-end gap-1 h-[40px]" aria-hidden="true">
      <div className="w-2.5 rounded-sm bg-[#CBD8EE]" style={{ height: h1 }} />
      <div className={`w-2.5 rounded-sm ${up ? "bg-[#16A34A]" : "bg-[#DC2626]"}`} style={{ height: h2 }} />
    </div>
  );
}

export function Sparkline({ data, tone = "#1F5FE0", height = 40 }: { data: number[]; tone?: string; height?: number }) {
  const w = 220, h = height, pad = 3;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });
  const area = `${pad},${h} ${pts.join(" ")} ${w - pad},${h}`;
  const id = `sp-${tone.replace("#", "")}-${data.length}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full mt-3" style={{ height }} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity="0.18" />
          <stop offset="100%" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={tone} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
