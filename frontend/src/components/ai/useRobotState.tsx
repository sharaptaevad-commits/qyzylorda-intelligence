import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { RobotState } from "./AiAnalystRobot";

interface RobotCtx {
  state: RobotState;
  setState: (s: RobotState) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  // one-time greeting bubble on first mount of the session (React state only,
  // not sessionStorage)
  greeted: boolean;
  markGreeted: () => void;
  // AI availability (rule-based engine is always present; this stays true).
  // If a future external provider is unconfigured we can flip it to "disabled".
  available: boolean;
}

const Ctx = createContext<RobotCtx | null>(null);

export function useRobot(): RobotCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRobot must be used inside <RobotProvider>");
  return c;
}

export function RobotProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RobotState>("idle");
  const [open, setOpen] = useState(false);
  const [greeted, setGreeted] = useState(false);
  const timer = useRef<number | null>(null);
  const available = true; // rule-based AI is built-in and always grounded

  // On first visit, briefly greet, then settle back to idle (once per session).
  useEffect(() => {
    if (greeted) return;
    setState("greeting");
    timer.current = window.setTimeout(() => {
      setState("idle");
      setGreeted(true);
    }, 1600);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
    // run once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const api = useMemo<RobotCtx>(() => ({
    state, setState,
    open, setOpen,
    greeted,
    markGreeted: () => setGreeted(true),
    available,
  }), [state, open, greeted, available]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
