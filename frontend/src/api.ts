// API client with auth token handling.
export const BASE = import.meta.env.VITE_API || "/api";

let token: string | null = localStorage.getItem("qyz_token");
let user: any = JSON.parse(localStorage.getItem("qyz_user") || "null");

export function setAuth(t: string | null, u: any) {
  token = t; user = u;
  if (t) { localStorage.setItem("qyz_token", t); localStorage.setItem("qyz_user", JSON.stringify(u)); }
  else { localStorage.removeItem("qyz_token"); localStorage.removeItem("qyz_user"); }
}
export function getToken() { return token; }
export function getUser() { return user; }

export class ApiError extends Error { status: number; detail: any; constructor(status: number, detail: any) { super(String(detail)); this.status = status; this.detail = detail; } }
// Thrown when the server cannot be reached at all (fetch failed: server down, CORS, offline).
export class NetworkError extends Error { isNetwork = true; constructor() { super("network"); } }

async function req(method: string, path: string, body?: any, opts: { raw?: boolean } = {}) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = "Bearer " + token;
  if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  } catch {
    // fetch rejected: server unreachable (down / offline / CORS). Use a typed error
    // so the UI can show a localized "server unavailable" message + retry, not "Failed to fetch".
    throw new NetworkError();
  }
  if (!res.ok) {
    let detail: any = null;
    try { const j = await res.json(); detail = j.detail ?? j; } catch { /* ignore */ }
    throw new ApiError(res.status, detail);
  }
  if (opts.raw) return res;
  return res.json();
}

export const api = {
  login: (username: string, password: string) => req("POST", "/auth/login", { username, password }),
  me: () => req("GET", "/auth/me"),
  i18n: (lang: string) => req("GET", `/i18n/${lang}`),
  dashboard: (lang: string, year = 2026) => req("GET", `/stats/dashboard?lang=${lang}&year=${year}`),
  industrial: (p: Record<string, string>) => req("GET", `/stats/industrial?${new URLSearchParams(p)}`),
  indexDynamics: (p: Record<string, string>) => req("GET", `/stats/index_dynamics?${new URLSearchParams(p)}`),
  volumeMonthly: (p: Record<string, string>) => req("GET", `/stats/volume_monthly?${new URLSearchParams(p)}`),
  volumeDynamics: (p: Record<string, string>) => req("GET", `/stats/volume_monthly?${new URLSearchParams(p)}`),
  industries: (p: Record<string, string>) => req("GET", `/stats/industries?${new URLSearchParams(p)}`),
  district: (p: Record<string, string>) => req("GET", `/stats/district?${new URLSearchParams(p)}`),
  districtCompare: (p: Record<string, string>) => req("GET", `/stats/district_compare?${new URLSearchParams(p)}`),
  periods: (p: Record<string, string>) => req("GET", `/stats/periods?${new URLSearchParams(p)}`),
  districtDetail: (region: string, lang: string) => req("GET", `/stats/district/${encodeURIComponent(region)}?lang=${lang}`),
  forecast: (body: any) => req("POST", "/forecast", body),
  forecastAvailability: (p: Record<string, string>) => req("GET", `/forecast/availability?${new URLSearchParams(p)}`),
  forecasts: () => req("GET", "/forecast"),
  upload: (file: File) => { const fd = new FormData(); fd.append("file", file); return req("POST", "/upload", fd); },
  analyze: (id: string) => req("POST", `/analyze/${id}`),
  documents: () => req("GET", "/documents"),
  document: (id: string) => req("GET", `/documents/${id}`),
  deleteDocument: (id: string) => req("DELETE", `/documents/${id}`),
  aiAnalysis: (id: string, lang: string) => req("GET", `/ai/${id}?lang=${lang}`),
  aiAsk: (question: string, lang: string, extra: any = {}) => req("POST", "/ai/ask", { question, lang, ...extra }),
  importDoc: (id: string, records: any[], confirmed: boolean) => req("POST", `/import/${id}`, { records, confirmed }),
  exportUrl: (id: string, kind: string, lang: string) => `${BASE}/export/${id}/${kind}?lang=${lang}`,
  platformExport: (kind: string, p: Record<string, string>) => `${BASE}/reports/export/${kind}?${new URLSearchParams(p)}`,
  reportHistory: () => req("GET", "/reports/history"),
  comparative: (body: any) => req("POST", "/comparative/run", body),
  alertsDetailed: (p: Record<string, string>) => req("GET", `/stats/alerts/detailed?${new URLSearchParams(p)}`),
  reportsConfig: () => req("GET", "/reports/config"),
  putReportsConfig: (body: any) => req("PUT", "/reports/config", body),
  anomalyDecision: (body: any) => req("POST", "/stats/alerts/decision", body),
  anomalyDecisions: () => req("GET", "/stats/alerts/decisions"),
  dataPreview: (file: File) => { const fd = new FormData(); fd.append("file", file); return req("POST", "/data/preview", fd); },
  dataImport: (body: any) => req("POST", "/data/import", body),
  dataHistory: () => req("GET", "/data/history"),
  dataRollback: (ts: number) => req("POST", "/data/rollback", { ts }),
  sources: () => req("GET", "/sources"),
  audit: (limit = 50) => req("GET", `/audit?limit=${limit}`),
  users: () => req("GET", "/users"),
  settings: () => req("GET", "/settings"),
  putSettings: (body: any) => req("PUT", "/settings", body),
  seasonal: () => req("GET", "/seasonal"),
  putSeasonal: (calendar: any[]) => req("PUT", "/seasonal", { calendar }),
  siteDb: (params: Record<string, string> = {}) => req("GET", `/site-db?${new URLSearchParams(params)}`),
};

export function download(url: string) { window.open(url, "_blank"); }
