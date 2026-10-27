import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./robot.css";

export type RobotState = "idle" | "greeting" | "thinking" | "speaking" | "alert" | "disabled";
export type RobotSize = "sm" | "md" | "lg";

const SIZES: Record<RobotSize, number> = { sm: 48, md: 96, lg: 180 };

// Design tokens (from the brand palette). Disabled state greys these out via CSS.
const C = {
  body: "#FFFFFF",
  bodyShade: "#EAF1FB",
  accent: "#1F5FE0",
  eye: "#38BDF8",
  shadow: "#CBD8EE",
  dark: "#0B2545",
  visor: "#0E1E3A",
};

/**
 * AiAnalystRobot — self-contained SVG mascot. No external raster images.
 *
 * Props:
 *  - size: "sm" (48px) | "md" (96px) | "lg" (180px)
 *  - state: "idle" | "greeting" | "thinking" | "speaking" | "alert" | "disabled"
 *  - onClick: handler (used by the floating button / hero)
 *  - className: extra classes
 *
 * Accessibility: role="img" + aria-label from i18n; when rendered as a
 * clickable button the wrapper is a real <button> (keyboard: Enter/Space)
 * with a visible focus ring (see .rr-fab).
 *
 * Reduced motion: when `prefers-reduced-motion: reduce` is set, every
 * animation is disabled (see robot.css media query) and the eyes stop
 * tracking the cursor — the component renders a static pose.
 */
export default function AiAnalystRobot({
  size = "md",
  state = "idle",
  onClick,
  className = "",
  asButton = false,
}: {
  size?: RobotSize;
  state?: RobotState;
  onClick?: () => void;
  className?: string;
  asButton?: boolean;
}) {
  const { t } = useTranslation();
  const px = SIZES[size];
  const reduced = usePrefersReducedMotion();
  const [look, setLook] = useState({ x: 0, y: 0 });

  // Eyes softly follow the cursor (maxOffset 3px), desktop only, and only
  // while motion is allowed and the robot isn't disabled/thinking.
  const canTrack = !reduced && state !== "disabled" && state !== "thinking";
  useEffect(() => {
    if (!canTrack) { setLook({ x: 0, y: 0 }); return; }
    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2 * 3;  // -3..3
      const ny = (e.clientY / window.innerHeight - 0.5) * 2 * 2; // -2..2
      setLook({ x: nx, y: ny });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [canTrack]);

  const animClass =
    (state === "greeting" ? "rr-greeting " : "") +
    (state === "thinking" ? "rr-thinking " : "") +
    (state === "speaking" ? "rr-speaking " : "") +
    (state === "alert" ? "rr-alert " : "") +
    (state === "disabled" ? "rr-disabled " : "rr-anim");

  const label =
    state === "disabled" ? t("robot_aria_disabled") :
    state === "thinking" ? t("robot_aria_thinking") :
    state === "alert" ? t("robot_aria_alert") :
    t("robot_aria");

  const eyeOn = state !== "disabled";
  // Eye shape per state (matches the reference sheet):
  //  idle/speaking -> round glowing dots
  //  greeting      -> happy arcs (curved down = smiling)
  //  thinking      -> tilted slits looking aside
  //  alert         -> wide round (with flash)
  //  disabled      -> flat short lines (eyes off)
  function Eye({ cx }: { cx: number }) {
    if (state === "disabled") return <line x1={cx - 3} y1={35} x2={cx + 3} y2={35} stroke="#5b6b86" strokeWidth="2" strokeLinecap="round" />;
    if (state === "greeting") return <path d={`M${cx - 3.4} 36 Q${cx} 31.5 ${cx + 3.4} 36`} fill="none" stroke={C.eye} strokeWidth="2.4" strokeLinecap="round" />;
    if (state === "thinking") return <path d={`M${cx - 3} 36.5 L${cx + 1} 33 L${cx + 3} 36`} fill="none" stroke={C.eye} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />;
    // idle / speaking / alert -> glowing circle
    return (
      <circle cx={cx} cy="35" r={state === "alert" ? 4.6 : 4.2} fill={C.eye}>
        {state === "speaking" && <animate attributeName="r" values="4.2;5;4.2" dur="1.1s" repeatCount="indefinite" />}
      </circle>
    );
  }
  const content = (
    <svg
      viewBox="0 0 100 100"
      width={px}
      height={px}
      role="img"
      aria-label={label}
      className={`${animClass} ${className}`}
      style={{ overflow: "visible", display: "block" }}
    >
      {/* soft floor shadow (scales with the float) */}
      <ellipse id="rr-shadow" cx="50" cy="92" rx="26" ry="5" fill={C.shadow} opacity=".28" />

      {/* body */}
      <g id="rr-body">
        <path d="M34 58 Q34 50 42 50 L58 50 Q66 50 66 58 L66 78 Q66 86 58 86 L42 86 Q34 86 34 78 Z"
          fill={C.body} stroke={C.shadow} strokeWidth="1.5" />
        {/* chest screen with a small bar chart */}
        <rect x="40" y="62" width="20" height="14" rx="2.5" fill={C.bodyShade} />
        <rect x="43" y="70" width="3" height="4" fill={C.accent} opacity=".8" />
        <rect x="48" y="67" width="3" height="7" fill={C.accent} opacity=".9" />
        <rect x="53" y="64" width="3" height="10" fill={C.accent} />
        {/* left arm (resting) */}
        <rect id="rr-leftArm" x="29" y="56" width="8" height="18" rx="4" fill={C.body} stroke={C.shadow} strokeWidth="1.2" />
        {/* right arm — waves (greeting) / raises (alert) */}
        <g id="rr-rightArm">
          <rect x="63" y="56" width="8" height="18" rx="4" fill={C.body} stroke={C.shadow} strokeWidth="1.2" />
          <circle cx="67" cy="55" r="4.5" fill={C.accent} />
        </g>
      </g>

      {/* head */}
      <g id="rr-head">
        <rect x="28" y="18" width="44" height="34" rx="12" fill={C.body} stroke={C.shadow} strokeWidth="1.5" />
        {/* visor */}
        <rect id="rr-visor" x="32" y="24" width="36" height="22" rx="9" fill={C.visor} />
        {/* eyes — shape by state, track cursor, blink/pulse */}
        <g id="rr-eyes" style={{ transform: `translate(${look.x}px, ${look.y}px)`, transition: "transform .2s ease-out" }}>
          <Eye cx={43} />
          <Eye cx={57} />
          {/* glow ring (speaking) */}
          {state === "speaking" && eyeOn && (
            <>
              <circle cx="43" cy="35" r="6" fill="none" stroke={C.eye} strokeWidth="1" opacity=".5" />
              <circle cx="57" cy="35" r="6" fill="none" stroke={C.eye} strokeWidth="1" opacity=".5" />
            </>
          )}
        </g>
        {/* thinking dots above the head */}
        <g id="rr-thinking" opacity={state === "thinking" ? 1 : 0}>
          <circle className="rr-dot" cx="42" cy="13" r="2.2" fill={C.accent} />
          <circle className="rr-dot" cx="50" cy="11" r="2.2" fill={C.accent} />
          <circle className="rr-dot" cx="58" cy="13" r="2.2" fill={C.accent} />
        </g>
        {/* alert flash (radial pulse) */}
        {state === "alert" && (
          <circle className="rr-flash" cx="50" cy="35" r="20" fill="none" stroke="#D97706" strokeWidth="2" opacity="0" />
        )}
        {/* headset — blue band + mic */}
        <g id="rr-headset">
          <path d="M26 32 Q26 16 50 16 Q74 16 74 32" fill="none" stroke={C.accent} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="27" cy="34" r="4.5" fill={C.accent} />
          <circle cx="73" cy="34" r="4.5" fill={C.accent} />
          {/* mic boom */}
          <path d="M73 34 Q78 44 66 46" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" />
          <circle id="rr-mic" cx="65" cy="46" r="2.6" fill={C.eye} />
        </g>
        {/* disabled badge */}
        {state === "disabled" && (
          <g id="rr-dis">
            <rect x="30" y="46" width="40" height="9" rx="3" fill="#94A3B8" opacity=".92" />
            <text x="50" y="52.4" textAnchor="middle" fontSize="5" fill="#fff" fontFamily="Inter, sans-serif">{t("robot_not_configured")}</text>
          </g>
        )}
      </g>
    </svg>
  );

  if (asButton) {
    return (
      <button
        type="button"
        className="rr-fab"
        onClick={onClick}
        aria-label={label}
        title={label}
        style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", lineHeight: 0 }}
      >
        {content}
      </button>
    );
  }
  return <span style={{ display: "inline-flex", lineHeight: 0 }}>{content}</span>;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}
