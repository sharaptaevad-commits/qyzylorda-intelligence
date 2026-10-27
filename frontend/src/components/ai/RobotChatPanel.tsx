import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Send, Sparkles, Lightbulb, AlertTriangle } from "lucide-react";
import { api } from "../../api";
import AiAnalystRobot, { type RobotState } from "./AiAnalystRobot";
import { useRobot } from "./useRobotState";

interface Msg { q: string; a: string; sources: string[]; err?: boolean; ts: number }

// Three ready-made chips, in all three languages (i18n keys).
const CHIP_KEYS = ["chip_mfg_change", "chip_district_growth", "chip_doc_db_diff"];

export default function RobotChatPanel() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2);
  const { open, setOpen, state, setState, available } = useRobot();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The rule-based NLP on the backend is Russian-keyword driven. To make the
  // kk/en chip questions actually resolve to data, we forward a normalized
  // Russian phrasing for known chip intents. The visible chip text stays in
  // the user's language (kk/ru/en); only the query sent to the engine is
  // normalized. Free-form user input is passed through unchanged.
  const CHIP_QUERY: Record<string, string> = {
    chip_mfg_change: "Индекс обрабатывающей промышленности по области",
    chip_district_growth: "Какие районы лидируют по индексу промышленности",
    chip_doc_db_diff: "Какие несовпадения найдены между документом и базой?",
  };
  function toQuery(text: string): string {
    for (const k of Object.keys(CHIP_QUERY)) {
      if (t(k).trim() === text.trim()) return CHIP_QUERY[k];
    }
    return text;
  }

  // scroll to bottom on new message / open
  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs, open]);

  // Escape closes the panel
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  async function ask(question: string) {
    const text = (question || q).trim();
    if (!text || busy) return;
    setBusy(true);
    setMsgs(m => [...m, { q: text, a: "", sources: [], ts: Date.now() }]);
    setQ("");
    setState("thinking");
    try {
      const r = await api.aiAsk(toQuery(text), lang);
      const answer = r.answer || t("no_data");
      setMsgs(m => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        last.a = answer;
        last.sources = r.sources || [];
        last.err = false;
        return copy;
      });
      setState("speaking");
      window.setTimeout(() => setState("idle"), 1400);
    } catch (e: any) {
      const detail = typeof e?.detail === "string" ? e.detail
        : e?.detail?.message || e?.message || t("robot_error");
      setMsgs(m => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        last.a = detail;
        last.sources = [];
        last.err = true;
        return copy;
      });
      setState("alert");
      window.setTimeout(() => setState("idle"), 1200);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const robotState: RobotState = !available ? "disabled" : busy ? (state === "alert" ? "alert" : "thinking") : state;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={t("robot_chat_title")}>
      {/* backdrop */}
      <div className="absolute inset-0 bg-[#0F2A4A]/25 lg:bg-transparent" onClick={() => setOpen(false)} />
      {/* panel — full-screen sheet on mobile, right drawer on desktop */}
      <div className="relative w-full sm:w-[420px] h-full bg-white shadow-2xl border-l border-[#E3E8F0] flex flex-col">
        {/* header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#E3E8F0] bg-[#F3F6FB]">
          <AiAnalystRobot size="sm" state={robotState} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[#0F2A4A] leading-tight">{t("robot_chat_title")}</div>
            <div className="text-[11px] text-txt2 truncate">{t("robot_chat_subtitle")}</div>
          </div>
          <button className="p-1.5 rounded-lg hover:bg-[#E4E7EC]" onClick={() => setOpen(false)} aria-label={t("close")} title={t("close")}>
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>

        {/* messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {msgs.length === 0 && (
            <div className="text-center text-txt2 text-sm py-8">{t("robot_empty")}</div>
          )}
          {msgs.map((m, i) => (
            <React.Fragment key={i}>
              {/* user bubble */}
              <div className="flex justify-end">
                <div className="max-w-[85%] bg-[#1F5FE0] text-white rounded-2xl rounded-br-sm px-3.5 py-2 text-sm shadow-sm">{m.q}</div>
              </div>
              {/* robot bubble */}
              <div className="flex items-start gap-2">
                <AiAnalystRobot size="sm" state={i === msgs.length - 1 && busy ? robotState : "idle"} className="shrink-0" />
                <div className="max-w-[85%] bg-[#F3F6FB] border border-[#E3E8F0] rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                  {m.a ? (
                    <>
                      <div className="text-sm whitespace-pre-wrap leading-relaxed text-[#0F2A4A]">{m.a}</div>
                      {m.sources?.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-[#E3E8F0]">
                          <div className="text-[10px] font-semibold text-[#1F5FE0] mb-1">{t("evidence")}</div>
                          <ul className="space-y-0.5">
                            {m.sources.map((s, j) => (
                              <li key={j} className="text-[11px] text-txt2 leading-snug">• {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : busy ? (
                    <div className="flex items-center gap-1.5 text-txt2 text-sm py-1">
                      <span className="rr-dot inline-block w-1.5 h-1.5 rounded-full bg-[#1F5FE0] animate-pulse" />
                      <span className="rr-dot inline-block w-1.5 h-1.5 rounded-full bg-[#1F5FE0] animate-pulse [animation-delay:.2s]" />
                      <span className="rr-dot inline-block w-1.5 h-1.5 rounded-full bg-[#1F5FE0] animate-pulse [animation-delay:.4s]" />
                    </div>
                  ) : null}
                  {m.err && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#D97706]">
                      <AlertTriangle className="w-3.5 h-3.5" aria-hidden /> {t("robot_error_hint")}
                    </div>
                  )}
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* chips */}
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {CHIP_KEYS.map((k) => (
            <button
              key={k}
              className="text-[11px] px-2.5 py-1 rounded-full bg-[#E8F0FE] text-[#0B3FA8] hover:bg-[#d6e3fb] transition-colors"
              onClick={() => ask(t(k))}
              disabled={busy}
            >
              {t(k)}
            </button>
          ))}
        </div>

        {/* input */}
        <div className="px-4 py-3 border-t border-[#E3E8F0]">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              className="input flex-1"
              value={q}
              placeholder={t("robot_input_placeholder")}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask(q)}
              disabled={!available}
              aria-label={t("robot_input_placeholder")}
            />
            <button
              className="btn-primary"
              onClick={() => ask(q)}
              disabled={busy || !available}
              aria-label={t("ai_send")}
            >
              <Send className="w-4 h-4" aria-hidden />
            </button>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-txt2">
            <Lightbulb className="w-3 h-3 shrink-0" aria-hidden />
            <span>{t("grounded_note")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
