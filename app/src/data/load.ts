import type { Desk, Evidence, Product, SignalType, Source, Tool } from "../types";

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? "https://bxtfkbifeirwebfytpax.supabase.co/functions/v1/api";
export const LIVE_APP_URL: string = import.meta.env.VITE_LIVE_URL ?? "https://devmun12.github.io/alpha-desk/";

async function fetchJson<T>(url: string, ms: number): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Live data from the pipeline when the API is reachable; otherwise the snapshot that was
 * captured from the same API (embedded in the single-file build, or ./snapshot.json).
 */
export async function loadDesk(): Promise<{ desk: Desk; source: Source }> {
  if (import.meta.env.MODE === "single") {
    // Single-file builds embed a snapshot written to src/data/snapshot.json before building.
    const mod = await import("./snapshot.json");
    if (!mod.default) throw new Error("No snapshot embedded in this build");
    return { desk: mod.default as unknown as Desk, source: "snapshot" };
  } else {
    const forced = new URLSearchParams(window.location.search).get("source");
    if (forced !== "snapshot") {
      try {
        return { desk: await fetchJson<Desk>(`${API_BASE}/desk`, 20000), source: "live" };
      } catch { /* fall through to the snapshot */ }
    }
    return { desk: await fetchJson<Desk>("./snapshot.json", 20000), source: "snapshot" };
  }
}

export async function postEvent(body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/event`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return res.ok;
  } catch {
    return false;
  }
}

export interface Extraction {
  relevant: boolean; role_family: string; seniority: string; signal_types: SignalType[]; products: Product[];
  current_tools: Tool[]; evidence: Evidence[]; facts: Record<string, string | null>; summary: string; confidence: number; dropped_quotes: number;
}

export interface AnalyzeResult {
  prefilter: { tags: string[]; candidate: boolean };
  extraction: Extraction;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  play: null | { playKey: string; persona: string; why_now: string; subject: string; email: string; linkedin: string; call_opener: string; quote_used: string; checks: { passed: boolean; issues: string[]; words: number }; model: string };
}

export async function analyze(body: { title: string; company: string; text: string }): Promise<AnalyzeResult> {
  const res = await fetch(`${API_BASE}/analyze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as AnalyzeResult;
}
