import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Account, Desk, DeskEvent, EventType, PlayRow, Signal, Source } from "./types";
import { loadDesk, postEvent } from "./data/load";

interface Toast { text: string; id: number }

interface Ctx {
  desk: Desk;
  source: Source;
  accounts: Account[];
  byId: Map<number, Account>;
  signalsFor: (accountId: number) => Signal[];
  playFor: (accountId: number) => PlayRow | undefined;
  eventsFor: (accountId: number) => DeskEvent[];
  log: (type: EventType, ids: { accountId: number; playId?: number; signalId?: number }, payload?: Record<string, unknown>) => void;
  toast: (text: string) => void;
  toastState: Toast | null;
}

const DeskCtx = createContext<Ctx | null>(null);
const LOCAL_KEY = "ad.local-events.v1";

function readLocal(): DeskEvent[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]"); } catch { return []; }
}
function writeLocal(e: DeskEvent[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(e.slice(-300))); } catch { /* storage unavailable */ }
}

const STATUS_FROM: Partial<Record<EventType, PlayRow["status"]>> = { approved: "approved", sent: "sent", dismissed: "dismissed" };

/** Apply rep actions on top of server data, so the screen reflects them immediately. */
function applyEvents(desk: Desk, local: DeskEvent[]): Desk {
  if (local.length === 0) return desk;
  const known = new Set(desk.events.map((e) => e.id));
  const fresh = local.filter((e) => !known.has(e.id));
  const plays = desk.plays.map((p) => {
    let next = p;
    for (const e of [...fresh].sort((a, b) => a.at.localeCompare(b.at))) {
      if (e.playId !== p.id) continue;
      const st = STATUS_FROM[e.type];
      if (st && p.status !== "held_out") next = { ...next, status: st };
      if (e.type === "edited") next = { ...next, subject: String(e.payload.subject ?? next.subject), email: String(e.payload.email ?? next.email) };
    }
    return next;
  });
  return { ...desk, plays, events: [...fresh, ...desk.events].sort((a, b) => b.at.localeCompare(a.at)) };
}

export function DeskProvider({ children, fallback }: { children: ReactNode; fallback: (state: "loading" | "error", retry: () => void) => ReactNode }) {
  const [base, setBase] = useState<{ desk: Desk; source: Source } | null>(null);
  const [failed, setFailed] = useState(false);
  const [local, setLocal] = useState<DeskEvent[]>(readLocal);
  const [toastState, setToast] = useState<Toast | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    loadDesk().then(setBase).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const toast = useCallback((text: string) => {
    const id = Date.now();
    setToast({ text, id });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 4200);
  }, []);

  const value = useMemo<Ctx | null>(() => {
    if (!base) return null;
    const desk = applyEvents(base.desk, local);
    const byId = new Map(desk.accounts.map((a) => [a.id, a]));
    const sig = new Map<number, Signal[]>();
    for (const s of desk.signals) sig.set(s.accountId, [...(sig.get(s.accountId) ?? []), s]);
    const play = new Map<number, PlayRow>();
    for (const p of desk.plays) if (!play.has(p.accountId)) play.set(p.accountId, p);
    return {
      desk, source: base.source, accounts: desk.accounts, byId,
      signalsFor: (id) => (sig.get(id) ?? []).sort((a, b) => b.confidence - a.confidence),
      playFor: (id) => play.get(id),
      eventsFor: (id) => desk.events.filter((e) => e.accountId === id),
      log: (type, ids, payload = {}) => {
        const e: DeskEvent = {
          id: -Date.now(), accountId: ids.accountId, playId: ids.playId ?? null, signalId: ids.signalId ?? null,
          type, payload, actor: "you", at: new Date().toISOString(),
        };
        setLocal((prev) => { const next = [...prev, e]; writeLocal(next); return next; });
        if (base.source === "live") void postEvent({ type, ...ids, payload, actor: "demo-visitor" });
      },
      toast, toastState,
    };
  }, [base, local, toast, toastState]);

  if (!value) return <>{fallback(failed ? "error" : "loading", load)}</>;
  return <DeskCtx.Provider value={value}>{children}</DeskCtx.Provider>;
}

export function useDesk(): Ctx {
  const v = useContext(DeskCtx);
  if (!v) throw new Error("useDesk outside provider");
  return v;
}

/** Tiny hash router: #desk, #account-12, #plays, #impact, #pipeline, #read, #about */
export function useRoute(): { page: string; id: number | null } {
  const parse = () => {
    const h = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    const m = h.match(/^account-(\d+)$/);
    if (m) return { page: "desk", id: Number(m[1]) };
    return { page: h || "desk", id: null };
  };
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => setR(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return r;
}

export function go(hash: string) {
  if (window.location.hash !== `#${hash}`) window.location.hash = hash;
}
