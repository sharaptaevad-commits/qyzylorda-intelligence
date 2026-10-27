import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import locales from "./locales.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      kk: { translation: (locales as any).kk },
      ru: { translation: (locales as any).ru },
      en: { translation: (locales as any).en },
    },
    fallbackLng: "ru",
    supportedLngs: ["kk", "ru", "en"],
    interpolation: { escapeValue: false },
    detection: { order: ["localStorage", "navigator"], caches: ["localStorage"] },
  });

export default i18n;

export function setLang(l: string) {
  localStorage.setItem("qyz_lang", l);
  i18n.changeLanguage(l);
}
