import { useEffect, useState } from "react";
import { api } from "./api";

// Read a boolean feature flag from /api/settings without re-fetching on every render.
export function useSettingFlag(key: string): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.settings()
      .then((s: any) => setEnabled(Boolean(s?.[key])))
      .catch(() => setEnabled(false))
      .finally(() => setLoading(false));
  }, [key]);
  return { enabled, loading };
}
