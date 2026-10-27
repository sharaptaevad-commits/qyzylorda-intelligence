import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { OBLAST, useRegionName } from "./regions";

// Divergent horizontal bar chart for the district index ranking.
//  - 100% is the axis/baseline: values below 100 draw left (red, ▼),
//    above 100 draw right (green, ▲). Bars grow FROM the 100% line, so
//    length and direction are truthful (never a 65% axis floor).
//  - The oblast total row is removed from the ranked list and shown as a
//    straight reference line instead ("Облыс: 107.2%").
//  - Outlier values (e.g. 303%) are clipped to a sensible axis (default 200)
//    with the true value written at the bar end and a ⚠ review flag.
export default function DistrictBars({ districts }: { districts: { region: string; label: string; value: number; status?: string }[] }) {
  const { t, i18n } = useTranslation();
  const regionName = useRegionName();
  const locale = i18n.language.slice(0, 2) === "kk" ? "kk-KZ" : i18n.language.slice(0, 2) === "ru" ? "ru-RU" : "en-US";
  const fmt = (v: number) => v.toLocaleString(locale, { maximumFractionDigits: 1 });

  // split off oblast, dedupe (backend already dedupes), sort desc by value
  const { list, oblast } = useMemo(() => {
    const seen = new Set<string>();
    const rows: { region: string; label: string; value: number; known: boolean; status?: string }[] = [];
    let ob: { region: string; value: number } | null = null;
    for (const d of districts) {
      if (d.region === OBLAST) { ob = { region: d.region, value: d.value }; continue; }
      if (seen.has(d.region)) continue;
      seen.add(d.region);
      const rn = regionName(d.region);
      rows.push({ region: d.region, label: rn.label, value: d.value, known: rn.known, status: d.status });
    }
    rows.sort((a, b) => (b.value || 0) - (a.value || 0));
    return { list: rows, oblast: ob };
  }, [districts, regionName]);

  // sensible axis ceiling: clip outliers at 200 (so 303% doesn't squash the rest)
  const CAP = 200;
  const maxAbs = Math.max(20, ...list.map((d) => Math.abs(d.value - 100)));
  const half = Math.min(CAP, Math.max(20, maxAbs)); // axis half-range in % from 100
  const barMax = 100; // 100% of the bar track = `half` points from baseline

  return (
    <div className="space-y-2.5">
      {list.map((d) => {
        const delta = d.value - 100;
        const up = delta >= 0;
        const clipped = Math.abs(d.value - 100) > CAP;
        const review = clipped || d.status === "review";
        // width as % of half-track
        const w = Math.min(1, Math.abs(delta) / half) * barMax;
        return (
          <div key={d.region} className="flex items-center gap-2"
            title={clipped ? t("district_review_flag") : undefined}>
            {/* left label (no wrap, enough width) */}
            <div className="w-[128px] sm:w-[148px] shrink-0 text-right text-[12.5px] text-[#0F2A4A] leading-tight flex items-center justify-end gap-1">
              <span className="truncate">{d.label}</span>
              {review && <span className="badge-warn" title={t("district_review_flag")}>⚠</span>}
              {!d.known && <span title={t("region_unknown")} className="text-[10px]">❓</span>}
            </div>
            {/* bar track: center = 100% */}
            <div className="flex-1 h-[18px] relative rounded bg-[#F1F5FB] overflow-hidden">
              {/* baseline at center */}
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#CBD8EE] z-10" />
              {/* bar grows from center left or right */}
              <div
                className="absolute top-[2px] bottom-[2px] rounded-sm"
                style={{
                  left: up ? "50%" : `${50 - (w / 2)}%`,
                  width: `${w / 2}%`,
                  background: up ? "#16A34A" : "#DC2626",
                  opacity: clipped ? 0.85 : 1,
                }}
              />
              {/* value at bar end */}
              <div
                className="absolute top-1/2 -translate-y-1/2 text-[11px] font-bold num whitespace-nowrap z-20"
                style={{
                  [up ? "left" : "right"]: `${50 + (w / 2) + 1}%`,
                  color: up ? "#16A34A" : "#DC2626",
                } as any}
              >
                {up ? "▲" : "▼"} {fmt(d.value)}%
              </div>
            </div>
          </div>
        );
      })}

      {/* oblast reference line */}
      {oblast && (
        <div className="flex items-center gap-2 pt-1.5 border-t border-[#E3E8F0]">
          <div className="w-[128px] sm:w-[148px] shrink-0 text-right text-[12.5px] text-txt2 leading-tight">
            {regionName(OBLAST).label}
          </div>
          <div className="flex-1 relative h-[18px]">
            <div className="absolute top-1/2 -translate-y-1/2 left-1/2 w-px h-[14px] bg-[#0F2A4A]" />
            <div className="absolute top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[#0F2A4A] whitespace-nowrap"
              style={{ left: `calc(50% + 8px)` }}>
              {t("district_total_label")}: {fmt(oblast.value)}%
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
