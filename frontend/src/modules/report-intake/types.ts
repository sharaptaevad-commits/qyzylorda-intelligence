// Report Intake module — frontend types (independent module, Phase 1).

export type RiStatus =
  | "pending" | "uploaded" | "checking" | "needs_fix" | "accepted" | "sent";

export interface RiEntity {
  id: string;
  name: string;
  kind?: string;
  person?: string;
  contact?: string;
  periods?: string[];
  deadline?: string;
}

export interface RiVersion {
  version: number;
  ts: number;
  file?: string;
  sha256?: string;
  rows: Record<string, unknown>[];
  columns: string[];
}

export interface RiReport {
  id: string;
  entity_id: string;
  period: string;
  status: RiStatus;
  versions: RiVersion[];
  created?: number;
  last_check?: { ts: number; errors: RiFinding[]; warnings: RiFinding[]; checked_by?: string };
}

export interface RiFinding {
  sheet: number;
  row: number;
  column: string;
  kind: string;
  message: string;
  expected: string;
}

export interface RiAudit {
  id: string;
  action: string;
  entity_id?: string;
  report_id?: string;
  user?: string;
  user_role?: string;
  detail?: Record<string, unknown>;
  ts: number;
}

export const RIAPI = import.meta.env.VITE_API_BASE || "";

export function riToken(): string {
  return localStorage.getItem("qyz_token") || "";
}

export async function riGet<T>(path: string): Promise<T> {
  const r = await fetch(
    `${RIAPI}/api/ri${path}${path.includes("?") ? "&" : "?"}lang=${(localStorage.getItem("qyz_lang") || "kk")}`,
    { headers: { Authorization: `Bearer ${riToken()}` } }
  );
  if (r.status === 403) throw new Error("ri_disabled");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

export async function riPost<T>(path: string, body: FormData | object): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${riToken()}` };
  const isForm = body instanceof FormData;
  if (!isForm) headers["Content-Type"] = "application/json";
  const r = await fetch(`${RIAPI}/api/ri${path}`, {
    method: "POST",
    headers,
    body: isForm ? body : JSON.stringify(body),
  });
  if (r.status === 403) throw new Error("ri_disabled");
  if (!r.ok) {
    let detail = "";
    try { detail = (await r.json()).detail || ""; } catch { /* ignore */ }
    throw new Error(detail || `HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}
