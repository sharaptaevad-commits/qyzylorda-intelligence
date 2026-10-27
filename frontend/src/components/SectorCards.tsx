import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { PieChart, Pie, Cell } from "recharts";
import { Pickaxe, Factory, Zap, Droplets, type LucideIcon } from "lucide-react";

// Sector cards with thematic photos. Each maps a structure metric to a
// /assets/sector-*.jpg image; if the file is absent, a colored icon fallback
// is rendered (no broken image). Photos are decorative; real share % is data.
interface SectorDef {
  key: string;           // matches structure[] metric_key
  icon: LucideIcon;
  tone: string;          // chart + fallback color
  img: string;           // /assets/...
}

const SECTORS: SectorDef[] = [
  { key: "mining",     icon: Pickaxe,  tone: "#1F5FE0", img: "/assets/sector-mining.jpg" },
  { key: "processing", icon: Factory,  tone: "#0EA5A4", img: "/assets/sector-processing.jpg" },
  { key: "utility",    icon: Zap,      tone: "#F59E0B", img: "/assets/sector-utility.jpg" },
  { key: "water",      icon: Droplets, tone: "#64748B", img: "/assets/sector-water.jpg" },
];

// Full localized sector names (never show the raw code)
const NAME_KEY: Record<string, string> = {
  mining: "sector_mining_full", processing: "sector_processing_full",
  utility: "sector_utility_full", water: "sector_water_full",
};

function Thumb({ def }: { def: SectorDef }) {
  const [ok, setOk] = useState(true);
  const Icon = def.icon;
  return (
    <span className="w-[56px] h-[56px] rounded-lg overflow-hidden shrink-0 relative block">
      {ok ? (
        <img src={def.img} alt="" width={56} height={56} loading="lazy" decoding="async"
          onError={() => setOk(false)} className="w-full h-full object-cover" />
      ) : (
        <span className="w-full h-full flex items-center justify-center" style={{ background: def.tone }}>
          <Icon className="w-5 h-5 text-white/80" aria-hidden />
        </span>
      )}
    </span>
  );
}

export default function SectorCards({ structure }: { structure: { key: string; label: string; value: number; share: number }[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.slice(0, 2) === "kk" ? "kk-KZ" : i18n.language.slice(0, 2) === "ru" ? "ru-RU" : "en-US";
  const byKey = Object.fromEntries((structure || []).map((s) => [s.key, s]));
  // keep only sectors present in data, in SECTORS order
  const items = SECTORS.map((def) => ({ def, s: byKey[def.key] })).filter((x) => x.s && x.s.share != null);
  const total = items.reduce((a, x) => a + (x.s.share || 0), 0);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      {/* donut */}
      <div className="relative w-[150px] h-[150px] shrink-0">
        <PieChart width={150} height={150}>
          <Pie data={items.map((x) => ({ name: x.def.key, value: x.s.share }))}
            dataKey="value" innerRadius={48} outerRadius={70} paddingAngle={2} startAngle={90} endAngle={-270}
            isAnimationActive={true} animationDuration={700}>
            {items.map((x, i) => <Cell key={i} fill={x.def.tone} />)}
          </Pie>
        </PieChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-[10px] text-txt2">{t("structure_total")}</div>
          <div className="text-lg font-bold text-[#0F2A4A]">{total.toLocaleString(locale, { maximumFractionDigits: 1 })}%</div>
        </div>
      </div>

      {/* legend: color + full name + % + thumbnail */}
      <div className="flex-1 w-full space-y-2.5">
        {items.map((x) => {
          return (
            <div key={x.def.key} className="flex items-center gap-2.5">
              <Thumb def={x.def} />
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: x.def.tone }} />
              <span className="flex-1 min-w-0 text-[13px] text-[#0F2A4A] leading-snug">
                {t(NAME_KEY[x.def.key] || x.def.key)}
              </span>
              <span className="text-[13px] font-bold text-[#0F2A4A] whitespace-nowrap">
                {x.s.share.toLocaleString(locale, { maximumFractionDigits: 1 })}%
              </span>
            </div>
          );
        })}
        <div className="text-[10px] text-txt2 pt-1 border-t border-[#E3E8F0]">{t("structure_unit_note")}</div>
      </div>
    </div>
  );
}
