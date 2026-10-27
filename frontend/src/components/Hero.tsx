import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapPin, Calendar, ArrowRight, Download } from "lucide-react";
import AiAnalystRobot from "./ai/AiAnalystRobot";
import { useRobot } from "./ai/useRobotState";

const HERO_ALTS: Record<string, string> = {
  kk: "Қызылорда қаласының панорамасы — өзен, көпір және қала аясы",
  ru: "Панорама города Кызылорда — река, мост и городская застройка",
  en: "Panorama of Kyzylorda city — river, bridge and skyline",
};

export default function Hero({ lastUpdate }: { lastUpdate?: number | null }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const { state, available } = useRobot();
  const robotState = !available ? "disabled" : state;
  const locale = lang === "kk" ? "kk-KZ" : lang === "ru" ? "ru-RU" : "en-US";

  const dateStr = lastUpdate
    ? new Date(lastUpdate * 1000).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";

  const [imgOk, setImgOk] = React.useState(true);

  return (
    <section
      className="relative rounded-2xl overflow-hidden flex items-center h-[210px] sm:h-[240px] lg:h-[280px]"
      aria-label={t("hero_title")}
    >
      {/* Background: real photo (eager, cover, no layout shift) with SVG fallback behind */}
      <img
        src="/assets/hero.jpg"
        alt={HERO_ALTS[lang] || HERO_ALTS.ru}
        width={1440}
        height={280}
        loading="eager"
        decoding="async"
        onError={() => setImgOk(false)}
        className={`absolute inset-0 w-full h-full object-cover object-center ${imgOk ? "" : "hidden"}`}
        style={{ backgroundImage: "none" }}
      />
      {!imgOk && (
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/assets/hero.svg')" }} />
      )}

      {/* Left→right gradient overlay for text legibility (right side reveals photo) */}
      <div
        className="absolute inset-0"
        style={{ backgroundImage: "linear-gradient(90deg, rgba(11,63,168,0.92) 0%, rgba(31,95,224,0.75) 45%, rgba(31,95,224,0.15) 100%)" }}
      />

      <div className="relative z-10 w-full grid grid-cols-1 lg:grid-cols-3 gap-5 p-5 sm:p-8">
        {/* Left: title + CTAs */}
        <div className="lg:col-span-2 text-white">
          <h1 className="text-xl sm:text-2xl lg:text-[30px] font-bold leading-tight max-w-2xl drop-shadow-sm">
            {t("hero_title")}
          </h1>
          <p className="mt-2.5 text-white/90 text-sm max-w-xl drop-shadow-sm">{t("hero_subtitle")}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/industrial" className="btn bg-white text-[#0B3FA8] hover:bg-white/90 shadow-sm">
              {t("hero_btn_metrics")} <ArrowRight className="w-4 h-4" aria-hidden />
            </Link>
            <Link to="/forecast" className="btn bg-transparent border border-white/70 text-white hover:bg-white/10">
              {t("hero_btn_forecast")}
            </Link>
          </div>
        </div>

        {/* Right: glass card — last update (real) + region, with the robot seated at the bottom */}
        <div className="lg:col-start-3 relative">
          <div
            className="rounded-xl p-4 sm:p-5 text-white shadow-lg border border-white/25"
            style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className="w-4 h-4 shrink-0" aria-hidden /> {t("hero_location")}
            </div>
            <div className="mt-3 pt-3 border-t border-white/20 flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-white/75">{t("hero_last_update")}</div>
                <div className="text-sm font-semibold truncate">{dateStr}</div>
              </div>
            </div>
          </div>
          {/* robot seated at the bottom-right of the card, overlapping the edge */}
          <div className="absolute -bottom-3 -right-2 hidden sm:flex flex-col items-center">
            <AiAnalystRobot size="md" state={robotState} />
          </div>
        </div>
      </div>

    </section>
  );
}
