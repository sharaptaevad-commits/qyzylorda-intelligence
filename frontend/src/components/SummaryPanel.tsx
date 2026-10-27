import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileText, ArrowRight, Lightbulb, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useSettingFlag } from "../useSettingsFlag";

interface SummaryLine { key: string; text: string; metric?: string; value?: any; period?: string; source?: string }

export default function SummaryPanel({ summaryLines, topGrowth, forecastAvailable, forecastNote }: {
  summaryLines?: SummaryLine[]; topGrowth?: any;
  forecastAvailable?: boolean; forecastNote?: string;
}) {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const { enabled: forecastEnabled } = useSettingFlag("forecast_enabled");
  const locale = i18n.language.slice(0, 2) === "kk" ? "kk-KZ" : i18n.language.slice(0, 2) === "ru" ? "ru-RU" : "en-US";
  const lines = (summaryLines || []).filter(l => l && l.text);

  return (
    <div className="card card-pad h-full flex flex-col">
      <div className="section-title mb-3"><FileText className="w-4 h-4" aria-hidden /><span>{t("summary_title")}</span></div>

      {/* 3-4 short fact lines, each with its own evidence */}
      <div className="space-y-2">
        {lines.length ? lines.map((l, i) => (
          <div key={l.key || i} className="flex items-start gap-2 text-[13px] leading-snug text-[#0F2A4A]">
            <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-[#1F5FE0] shrink-0" />
            <span>{l.text}</span>
          </div>
        )) : <div className="text-sm text-txt2">{t("no_data_imported")}</div>}

        {/* top growth sector (real data) */}
        {topGrowth && (
          <div className="flex items-start gap-2 text-[13px] leading-snug">
            <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-[#0EA5A4] shrink-0" />
            <span className="text-[#0F2A4A]">
              {topGrowth.label}:{" "}
              <span className={`inline-flex items-center gap-0.5 font-bold ${(topGrowth.change ?? 0) >= 0 ? "text-[#16A34A]" : "text-[#DC2626]"}`}>
                {(topGrowth.change ?? 0) >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" aria-hidden /> : <ArrowDownRight className="w-3.5 h-3.5" aria-hidden />}
                {Math.abs(topGrowth.change ?? 0).toLocaleString(locale, { maximumFractionDigits: 1 })} п.п.
                {topGrowth.prior_year ? ` ${t("vs_prior")} ${topGrowth.prior_year}` : ""}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* AI forecast block — hidden entirely when the forecasting feature flag is off */}
      {forecastEnabled && (
        <div className="mt-auto pt-3">
          <div className="bg-[#E8F0FE] rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0B3FA8]">
              <Lightbulb className="w-4 h-4" aria-hidden /> {t("summary_ai")}
            </div>
            <p className="mt-1.5 text-[12px] text-[#0F2A4A]/80 leading-snug">
              {forecastAvailable ? (forecastNote || "") : t("summary_ai_unavailable")}
            </p>
            <p className="mt-1 text-[10px] text-txt2 italic">{t("forecast_not_official")}</p>
          </div>
        </div>
      )}

      {forecastEnabled && (
        <Link to="/ai" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#1F5FE0] hover:gap-2 transition-all">
          {t("summary_full")} <ArrowRight className="w-3.5 h-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}
