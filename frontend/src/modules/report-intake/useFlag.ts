// Report Intake module — feature flag hook (reads /api/settings.report_intake_enabled).
import { useEffect, useState } from "react";
import { RIAPI } from "./types";

export function useReportIntakeEnabled(): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${RIAPI}/api/settings?lang=${localStorage.getItem("qyz_lang") || "kk"}`)
      .then(r => (r.ok ? r.json() : null))
      .then(s => setEnabled(Boolean(s?.report_intake_enabled)))
      .catch(() => setEnabled(false))
      .finally(() => setLoading(false));
  }, []);
  return { enabled, loading };
}
