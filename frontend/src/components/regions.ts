import { useTranslation } from "react-i18next";

// Canonical district id -> i18n key, so display names are always consistent
// regardless of how the import spelled the region (Кызылорда/Қызылорда,
// Жанакорган/Жаңақорған, Шиелийский/Шие...). Unknown regions are surfaced as
// "unrecognized" for review, never silently dropped.
export const REGION_KEYS: Record<string, string> = {
  "Аральский": "region_aral",
  "Жалагашский": "region_zhalagash",
  "Жанакорганский": "region_zhanakorgan",
  "Казалинский": "region_kazaly",
  "Кармакшинский": "region_kar-maksha",
  "Сырдарьинский": "region_syrdarya",
  "Шиелийский": "region_shieli",
  "Кызылорда г.а": "region_kyzylorda",
  "Байконыр г.а": "region_baikonur",
  "Кызылординская область": "region_oblast",
};
export const OBLAST = "Кызылординская область";

export function useRegionName() {
  const { t } = useTranslation();
  return (region: string): { label: string; known: boolean } => {
    const key = REGION_KEYS[region];
    if (key) return { label: t(key), known: true };
    // fall back to whatever label the backend sent, but flag as unknown
    return { label: region, known: false };
  };
}
