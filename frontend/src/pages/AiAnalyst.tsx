import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { ErrorBox, SectionTitle } from "../components/ui";

const EXAMPLES: Record<string, string[]> = {
  ru: ["Какой индекс по области?", "Какие районы лидируют?", "Какие несовпадения найдены?"],
  en: ["What is the regional index?", "Which districts lead?", "What discrepancies were found?"],
  kk: ["Облыс бойынша индекс қандай?", "Қай аудандар алдыңғы қатарда?", "Қандай сәйкессіздіктер табылды?"],
};

export default function AiAnalyst() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<{ q: string; a: string; sources: string[] }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<any>(null);

  async function ask(question: string) {
    if (!question.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.aiAsk(question, lang);
      setMsgs(m => [...m, { q: question, a: r.answer || t("ai_no_answer"), sources: r.sources || [] }]);
      setQ("");
    } catch (e: any) { setErr(e); } finally { setBusy(false); }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="card card-pad">
        <SectionTitle>{t("ai_title")}</SectionTitle>
        <div className="flex gap-2">
          <input className="input" value={q} placeholder={t("ai_placeholder")}
            onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && ask(q)} />
          <button className="btn-primary" onClick={() => ask(q)} disabled={busy}>{t("ai_send")}</button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {(EXAMPLES[lang] || EXAMPLES.ru).map((ex: string, i: number) => (
            <button key={i} className="badge-neutral hover:bg-[#E4E7EC]" onClick={() => ask(ex)}>{ex}</button>
          ))}        </div>
      </div>

      {err && <ErrorBox error={err} />}
      {busy && <div className="card card-pad"><div className="lbl">…</div></div>}

      <div className="space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className="card card-pad">
            <div className="text-[11px] font-semibold text-[#1F5FE0] mb-1">Q: {m.q}</div>
            <div className="text-sm whitespace-pre-wrap">{m.a}</div>
            {m.sources?.length > 0 && (
              <div className="mt-2 text-[11px] text-txt2">
                {t("ai_sources")}: {m.sources.join(" · ")}
              </div>
            )}
          </div>
        ))}
        {msgs.length === 0 && !busy && (
          <div className="card card-pad text-center text-txt2 text-sm py-8">{t("ai_no_answer")}</div>
        )}
      </div>
    </div>
  );
}
