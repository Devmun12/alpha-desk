import { useEffect, useMemo, useRef, useState } from "react";
import type { Account, DeskEvent } from "../types";
import { go, useDesk } from "../store";
import { PLAY_BY_KEY, PLAYS } from "../../../supabase/functions/_shared/plays.ts";
import { ATS, PRODUCT, SIGNAL } from "../data/taxonomy";
import { ago, dateTime, n } from "../lib/format";
import { Posting } from "../components/Posting";
import { PlayPanel } from "../components/PlayPanel";
import { Empty, Seg, SignalPill } from "../components/ui";
import { IconBack, IconLock } from "../components/icons";

type View = "ready" | "all" | "customers" | "control";

export function Desk({ selected }: { selected: number | null }) {
  const { accounts, playFor, signalsFor, byId, log, eventsFor } = useDesk();
  const [view, setView] = useState<View>("ready");
  const [play, setPlay] = useState("any");
  const [product, setProduct] = useState("any");
  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => accounts.filter((a) => {
    const p = playFor(a.id);
    if (view === "ready" && (a.holdout && a.crmStatus !== "customer" || !p || p.status === "held_out" || p.status === "dismissed")) return false;
    if (view === "customers" && a.crmStatus !== "customer") return false;
    if (view === "control" && !(a.holdout && a.crmStatus !== "customer")) return false;
    if (play !== "any" && p?.playKey !== play) return false;
    if (product !== "any" && !(a.products ?? []).includes(product as never)) return false;
    return true;
  }), [accounts, view, play, product, playFor]);

  const counts = useMemo(() => ({
    ready: accounts.filter((a) => { const p = playFor(a.id); return p && p.status !== "held_out" && p.status !== "dismissed"; }).length,
    control: accounts.filter((a) => a.holdout && a.crmStatus !== "customer").length,
    customers: accounts.filter((a) => a.crmStatus === "customer").length,
  }), [accounts, playFor]);

  // Desktop: open the top account by default so the desk never starts empty.
  useEffect(() => {
    if (selected == null && rows[0] && window.matchMedia("(min-width: 821px)").matches) go(`account-${rows[0].id}`);
  }, [selected, rows]);

  // Count an account as viewed once per session: the adoption metric's denominator.
  useEffect(() => {
    if (selected == null) return;
    const key = `ad.viewed.${selected}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch { /* no storage */ }
    const p = playFor(selected);
    log("viewed", { accountId: selected, playId: p?.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // j / k to move through the queue.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return;
      const i = rows.findIndex((r) => r.id === selected);
      if (e.key === "j" && rows[i + 1]) go(`account-${rows[i + 1].id}`);
      if (e.key === "k" && i > 0) go(`account-${rows[i - 1].id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selected]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const account = selected != null ? byId.get(selected) : undefined;

  return (
    <div className={`desk ${account ? "has-selection" : ""}`}>
      <section className="queue" aria-label="Accounts to work">
        <div className="queue-head">
          <div className="queue-title">
            <h2>Today's desk</h2>
            <span className="small muted num">{rows.length} accounts</span>
          </div>
          <Seg<View> label="Which accounts" value={view} onChange={setView} options={[
            { value: "ready", label: `Ready ${counts.ready}` },
            { value: "all", label: "All scored" },
            { value: "customers", label: `Customers ${counts.customers}` },
            { value: "control", label: `Control ${counts.control}` },
          ]} />
          <div className="row">
            <select className="select" aria-label="Filter by play" value={play} onChange={(e) => setPlay(e.target.value)}>
              <option value="any">Every play</option>
              {PLAYS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
            <select className="select" aria-label="Filter by product" value={product} onChange={(e) => setProduct(e.target.value)}>
              <option value="any">Every product</option>
              {Object.entries(PRODUCT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="queue-list" ref={listRef} role="listbox" aria-label="Accounts, highest score first">
          {rows.length === 0 && <Empty title="Nothing in this view"><p className="soft">Change the filters, or check the pipeline page to see when boards were last read.</p></Empty>}
          {rows.map((a) => <QueueRow key={a.id} a={a} selected={a.id === selected} />)}
        </div>
      </section>

      <section className="dossier" aria-label="Account detail">
        {account ? (
          <Dossier account={account} key={account.id} events={eventsFor(account.id)} signals={signalsFor(account.id)} />
        ) : (
          <Empty title="Pick an account"><p className="soft">Accounts are ranked by how clearly their own job posts describe a problem your product solves.</p></Empty>
        )}
      </section>
    </div>
  );
}

function QueueRow({ a, selected }: { a: Account; selected: boolean }) {
  const { playFor, signalsFor } = useDesk();
  const p = playFor(a.id);
  const s = signalsFor(a.id)[0];
  const q = s?.evidence[0]?.quote;
  const control = a.holdout && a.crmStatus !== "customer";
  return (
    <button className="qrow" role="option" aria-selected={selected} onClick={() => go(`account-${a.id}`)}>
      <div>
        <div className="score num">{a.score}</div>
        <div className="tier">Tier {a.tier}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="name">
          <span>{a.name}</span>
          {a.crmStatus === "customer" && <span className="pill customer">Customer</span>}
          {control && <span className="pill control"><IconLock />Control</span>}
        </div>
        <div className="meta">
          <span>{p ? PLAY_BY_KEY[p.playKey]?.name : SIGNAL[a.topSignal]?.short}</span>
          <span aria-hidden="true">/</span>
          <span>{s ? `posted ${ago(s.postedAt)}` : ""}</span>
        </div>
        {q && <div className="quote">“{q}”</div>}
      </div>
      {p && p.status !== "draft" && p.status !== "held_out" && <span className="status">{p.status === "approved" ? "Approved" : p.status === "sent" ? "Sent" : "Dismissed"}</span>}
    </button>
  );
}

const EVENT_LABEL: Record<string, string> = {
  surfaced: "Surfaced by the pipeline", viewed: "Opened", approved: "Draft approved", edited: "Draft edited", sent: "Marked as sent",
  dismissed: "Dismissed", signal_up: "Signal confirmed", signal_down: "Signal marked wrong", replied: "Reply received",
  meeting: "Meeting booked", opportunity: "Opportunity created",
};

function Dossier({ account: a, signals, events }: { account: Account; signals: ReturnType<ReturnType<typeof useDesk>["signalsFor"]>; events: DeskEvent[] }) {
  const { playFor, log, toast, desk } = useDesk();
  const play = playFor(a.id);
  const weights = Object.fromEntries(desk.weights.map((w) => [w.signal_type, w.points]));
  const feedback = (id: number) => {
    const e = events.find((x) => x.signalId === id && (x.type === "signal_up" || x.type === "signal_down"));
    if (!e) return undefined;
    return e.type === "signal_up" ? ("up" as const) : ("down" as const);
  };
  const types = Object.entries(a.breakdown).sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0));

  return (
    <div className="dossier-inner">
      <button className="btn ghost sm back" onClick={() => go("desk")} style={{ marginBottom: 12 }}><IconBack /> All accounts</button>
      <div className="dossier-head">
        <div>
          <h1 className="display">{a.name}</h1>
          <div className="facts">
            <span>{a.category}</span>
            <span><b className="num">{n(a.openRoles)}</b> open roles</span>
            <span><b className="num">{n(a.salesRoles)}</b> of them in sales</span>
            <span>Board on {a.ats ? ATS[a.ats] : "unknown"}</span>
            <a href={`https://${a.domain}`} target="_blank" rel="noreferrer">{a.domain}</a>
          </div>
        </div>
        <div className="scorebox">
          <div className="big num">{a.score}</div>
          <div className="of">out of 100, tier {a.tier}</div>
        </div>
      </div>
      {(play?.whyNow || signals[0]) && <p className="why">{play?.whyNow || signals[0].summary}</p>}

      <div className="meter" aria-label="How the score is built">
        <MeterRow label="Intent" value={a.intent} max={60} note={types.map(([t, v]) => `${SIGNAL[t as keyof typeof SIGNAL]?.short} ${v}`).join(", ")} />
        <MeterRow label="Fit" value={a.fit} max={25} note={`${a.salesRoles} open sales roles: a bigger, growing sales team means more comp complexity`} />
        <MeterRow label="Timing" value={a.timing} max={15} note={a.freshest ? `Newest relevant post ${ago(a.freshest)}` : ""} />
        <div className="actions" style={{ marginTop: 4 }}>
          {types.map(([t, v]) => <SignalPill key={t} type={t as never} points={v} />)}
        </div>
      </div>

      <div className="section">
        <h2>What their job posts say</h2>
        <p className="sub">Highlights are lines the AI flagged and the pipeline verified word for word against the posting. Lines it could not verify are never shown.</p>
        {signals.map((s) => (
          <Posting key={s.id} signal={s} points={weights} feedback={feedback(s.id)}
            onFeedback={(v) => { log(v === "up" ? "signal_up" : "signal_down", { accountId: a.id, signalId: s.id }); toast(v === "up" ? "Thanks. Marked as a real signal." : "Marked as misread. It counts against precision."); }} />
        ))}
      </div>

      <div className="section">
        <h2>Recommended play</h2>
        <p className="sub">Chosen from the play catalog by the strongest signal; the first touch is drafted from the verified lines above and checked before it reaches you.</p>
        <PlayPanel account={a} play={play} signals={signals} />
      </div>

      <div className="section">
        <h2>Activity</h2>
        {events.length === 0 ? <p className="soft">No activity yet.</p> : (
          <ul className="timeline">
            {events.slice(0, 12).map((e) => (
              <li key={e.id}><span className="when">{dateTime(e.at)}</span><span>{EVENT_LABEL[e.type] ?? e.type}{typeof e.payload.reason === "string" ? `: ${e.payload.reason}` : ""}{e.actor === "you" ? " (you)" : ""}</span></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MeterRow({ label, value, max, note }: { label: string; value: number; max: number; note: string }) {
  return (
    <div>
      <div className="meter-row">
        <span className="lab">{label}</span>
        <div className="bar" role="img" aria-label={`${label} ${value} of ${max}`}><i style={{ width: `${(value / max) * 100}%` }} /></div>
        <span className="num small">{value} / {max}</span>
      </div>
      {note && <div className="meter-note" style={{ marginLeft: 86 }}>{note}</div>}
    </div>
  );
}
