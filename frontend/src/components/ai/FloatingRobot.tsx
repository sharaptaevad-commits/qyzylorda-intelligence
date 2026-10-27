import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import AiAnalystRobot from "./AiAnalystRobot";
import { useRobot } from "./useRobotState";
import RobotChatPanel from "./RobotChatPanel";

/**
 * Floating "AI-Аналитик" robot — bottom-right on every page (sm size).
 * Clicking it opens the chat panel (full-screen sheet on mobile, right
 * drawer on desktop). The one-time greeting bubble appears here on first
 * visit and never repeats within the session.
 */
export default function FloatingRobot() {
  const { t } = useTranslation();
  const { state, setOpen, open, available, greeted, markGreeted } = useRobot();
  const [showBubble, setShowBubble] = useState(false);

  // show the greeting bubble briefly once, right after the greet animation
  useEffect(() => {
    if (greeted) return;
    const t1 = window.setTimeout(() => setShowBubble(true), 1500);
    const t2 = window.setTimeout(() => { setShowBubble(false); markGreeted(); }, 5500);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const robotState = !available ? "disabled" : state;

  return (
    <>
      {/* greeting speech bubble */}
      {showBubble && (
        <div
          className="fixed bottom-[84px] right-4 sm:right-6 z-50 max-w-[240px] bg-white border border-[#E3E8F0] rounded-2xl rounded-br-sm px-3.5 py-2.5 shadow-lg"
          style={{ animation: "rr-pop .4s ease-out" }}
          role="status"
          aria-live="polite"
        >
          <div className="text-[12px] leading-snug text-[#0F2A4A]">{t("robot_greeting")}</div>
        </div>
      )}

      {/* floating button */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50">
        <AiAnalystRobot
          size="sm"
          state={open ? "idle" : robotState}
          asButton
          onClick={() => setOpen(!open)}
          className={open ? "scale-95" : ""}
        />
      </div>

      <RobotChatPanel />
    </>
  );
}
