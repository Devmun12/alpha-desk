import { useMemo, useState } from "react";
import { useDesk } from "../store";
import { compact, date, n, pct } from "../lib/format";
import { Stat } from "../components/ui";

/** Two-proportion sample size per arm, two-sided alpha 0.05, power 0.8. */
function sampleSize(p1: number, p2: number): number {
  const za = 1.96, zb = 0.8416, pbar = (p1 + p2) / 2;
  const num = za * Math.sqrt(2 * pbar * (1 - pbar)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return Math.ceil((num * num) / ((p2 - p1) ** 2));
}

export function Impact() {
  const { desk } = useDesk();
  const s = desk.stats;
  const [baseline, setBaseline] = useState(3);
  const [lift, setLift] = useState(2);
  const [weekly, setWeekly] = useState(40);
  const [minutes, setMinutes] = useState(20);
  const [priceIn, setPriceIn] = useState(0.1);
  const [priceOut, setPriceOut] = useState(0.4);

  const m = useMemo(() => {
    const ev = desk.events;
    const distinct = (t: string) => new Set(ev.filter((e) => e.type === t).map((e) => e.playId ?? e.accountId)).size;
    const drafted = desk.plays.filter((p) => p.status !== "held_out");
    const scoredProspects = desk.accounts.filter((a) => a.crmStatus !== "customer" && a.score >= 35);
    const treat = scoredProspects.filter((a) => !a.holdout);
    const ctrl = scoredProspects.filter((a) => a.holdout);
    const treatIds = new Set(treat.map((a) => a.id));
    const outcome = (t: string, ids: Set<number>) => new Set(ev.filter((e) => e.type === t && e.accountId != null && ids.has(e.accountId)).map((e) => e.accountId)).size;
    const up = ev.filter((e) => e.type === "signal_up").length;
    const down = ev.filter((e) => e.type === "signal_down").length;
    const passed = drafted.filter((p) => "passed" in p.checks && p.checks.passed).length;
    const reasons: Record<string, number> = {};
    for (const e of ev.filter((x) => x.type === "dismissed")) { const r = String(e.payload.reason ?? "No reason"); reasons[r] = (reasons[r] ?? 0) + 1; }
    return {
      drafted: drafted.length, viewed: distinct("viewed"), approved: distinct("approved"), sent: distinct("sent"),
      replied: distinct("replied"), meetings: distinct("meeting"), opps: distinct("opportunity"),
      treat: treat.length, ctrl: ctrl.length, treatReplies: outcome("replied", treatIds), treatMeetings: outcome("meeting", treatIds),
      up, down, passed, reasons,
    };
  }, [desk]);

  const funnel: [string, number, string][] = [
    ["Open postings read", s.postings, `Every open role on ${n(s.boards)} public job boards`],
    ["Worth an AI read", s.candidates, "Kept by the free rule-based screen"],
    ["Read by the AI", s.read, "Structured extraction, current prompt version"],
    ["Real buying signals", s.relevant, "Relevant and backed by a verified quote"],
    ["Accounts scored", desk.accounts.length, "Rolled up per company"],
    ["Plays drafted", m.drafted, "Treatment accounts at score 35 or more"],
    ["Approved by a rep", m.approved, "Adoption"],
    ["Sent", m.sent, ""],
    ["Replies", m.replied, "Logged by reps until CRM sync is on"],
    ["Meetings", m.meetings, "Primary outcome"],
  ];
  const max = Math.max(...funnel.map((f) => f[1]), 1);
  const nPerArm = sampleSize(baseline / 100, Math.min(0.99, (baseline * lift) / 100));
  const weeksToRead = Math.ceil(nPerArm / Math.max(1, weekly * 0.8));
  const tokensIn = s.extractTokensIn + s.draftTokensIn;
  const tokensOut = s.extractTokensOut + s.draftTokensOut;
  const costNow = (tokensIn * priceIn + tokensOut * priceOut) / 1e6;
  const perAccount = desk.accounts.length ? costNow / desk.accounts.length : 0;
  const hours = (desk.accounts.length * minutes) / 60;

  return (
    <div className="page-inner">
      <div className="page-head">
        <h1>Is it working?</h1>
        <p className="lede">The job is more meetings with the right companies, sooner, at a cost near zero. This page tracks it end to end: what was read, what reps did with it, and whether accounts that got a play beat the control group that did not.</p>
      </div>

      <div className="stat-line">
        <Stat v={n(s.postings)} k="open postings read" />
        <Stat v={n(desk.accounts.length)} k="accounts with a verified signal" />
        <Stat v={`$${costNow.toFixed(2)}`} k="model cost so far, at the prices below" />
        <Stat v={`${Math.round(hours)} h`} k={`research time saved at ${minutes} min an account`} />
      </div>

      <div className="section panel">
        <h2>From job post to meeting</h2>
        <p className="sub" style={{ marginBottom: 16 }}>Counts since the first run on {date(s.firstIngest)}. Grey bars are steps that depend on reps and replies.</p>
        <div className="funnel" role="table" aria-label="Funnel">
          {funnel.map(([label, v, hint], i) => (
            <div className="funnel-row" role="row" key={label}>
              <span role="cell">{label}<br /><span className="conv">{hint}</span></span>
              <div className="track" role="cell" aria-hidden="true">
                <div className={`fill ${i >= 6 ? "later" : ""}`} style={{ width: `${Math.max(0.3, (Math.log10(v + 1) / Math.log10(max + 1)) * 100)}%` }} />
                <span className="tip">{n(v)} {i > 0 ? `(${pct(v, funnel[i - 1][1], 1)} of previous step)` : ""}</span>
              </div>
              <span className="val num" role="cell">{n(v)}{i > 0 && <><br /><span className="conv">{pct(v, funnel[i - 1][1], 1)}</span></>}</span>
            </div>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>Bar length is on a log scale so the early, large steps and the late, small ones are both readable; the numbers are exact.</p>
      </div>

      <div className="section grid-2">
        <div className="panel">
          <h2>The experiment</h2>
          <p className="sub" style={{ marginBottom: 12 }}>Every prospect scoring 35 or more is assigned by a stable hash: 80% get the play, 20% are held out and never contacted from this tool.</p>
          <table className="data">
            <thead><tr><th>Arm</th><th className="r">Accounts</th><th className="r">Replies</th><th className="r">Meetings</th></tr></thead>
            <tbody>
              <tr><td>Treatment: got the play</td><td className="r num">{n(m.treat)}</td><td className="r num">{n(m.treatReplies)}</td><td className="r num">{n(m.treatMeetings)}</td></tr>
              <tr><td>Control: held out</td><td className="r num">{n(m.ctrl)}</td><td className="r muted">from CRM</td><td className="r muted">from CRM</td></tr>
            </tbody>
          </table>
          <p className="small soft" style={{ marginTop: 12 }}>Primary metric: meetings booked within 30 days of an account first surfacing. Control outcomes come from the CRM (inbound demos, other outbound), which is why HubSpot sync is the next build. Readout on day 45; a play that shows no lift is retired, as its card says.</p>
        </div>
        <div className="panel">
          <h2>How long until we know</h2>
          <p className="sub" style={{ marginBottom: 12 }}>Accounts needed per arm to detect the lift with 80% power at a 5% false-positive rate. Edit the assumptions.</p>
          <div className="grid-3" style={{ gap: 10 }}>
            <label className="field">Baseline meeting rate %<input className="input num" type="number" min={0.5} max={30} step={0.5} value={baseline} onChange={(e) => setBaseline(Number(e.target.value) || 3)} /></label>
            <label className="field">Lift to detect<input className="input num" type="number" min={1.2} max={5} step={0.1} value={lift} onChange={(e) => setLift(Number(e.target.value) || 2)} /></label>
            <label className="field">New accounts a week<input className="input num" type="number" min={5} max={500} step={5} value={weekly} onChange={(e) => setWeekly(Number(e.target.value) || 40)} /></label>
          </div>
          <p style={{ marginTop: 14, fontSize: 15 }}><b className="num">{n(nPerArm)}</b> accounts per arm. At {weekly} a week, the control arm fills in about <b className="num">{n(Math.ceil(nPerArm / Math.max(1, weekly * 0.2)))}</b> weeks; the treatment arm in <b className="num">{n(weeksToRead)}</b>.</p>
          <p className="small soft" style={{ marginTop: 8 }}>Until then, decisions run on leading indicators: rep approval rate, signal precision and positive-reply rate per play. If the control arm is the bottleneck, raise its share or pool across plays.</p>
        </div>
      </div>

      <div className="section grid-3">
        <div className="panel">
          <h3>Adoption</h3>
          <p className="sub">Do reps use what it surfaces?</p>
          <dl className="kv" style={{ marginTop: 12, gridTemplateColumns: "1fr auto" }}>
            <dt>Accounts opened</dt><dd className="num">{n(m.viewed)}</dd>
            <dt>Drafts approved</dt><dd className="num">{n(m.approved)} ({pct(m.approved, m.drafted)})</dd>
            <dt>Sent</dt><dd className="num">{n(m.sent)}</dd>
            <dt>Dismissed</dt><dd className="num">{n(Object.values(m.reasons).reduce((a, b) => a + b, 0))}</dd>
          </dl>
          {Object.keys(m.reasons).length > 0 && <p className="small muted" style={{ marginTop: 8 }}>{Object.entries(m.reasons).map(([r, c]) => `${r}: ${c}`).join("; ")}</p>}
        </div>
        <div className="panel">
          <h3>Quality</h3>
          <p className="sub">Is the AI right, and is it honest?</p>
          <dl className="kv" style={{ marginTop: 12, gridTemplateColumns: "1fr auto" }}>
            <dt>Quotes kept after verification</dt><dd className="num">{n(s.keptQuotes)}</dd>
            <dt>Quotes dropped as unverifiable</dt><dd className="num">{n(s.droppedQuotes)} ({pct(s.droppedQuotes, s.keptQuotes + s.droppedQuotes)})</dd>
            <dt>Drafts passing all checks</dt><dd className="num">{n(m.passed)} of {n(m.drafted)}</dd>
            <dt>Rep-rated precision</dt><dd className="num">{m.up + m.down ? pct(m.up, m.up + m.down) : "no ratings yet"}</dd>
          </dl>
        </div>
        <div className="panel">
          <h3>Cost</h3>
          <p className="sub">Runs on Gemini's free tier today.</p>
          <dl className="kv" style={{ marginTop: 12, gridTemplateColumns: "1fr auto" }}>
            <dt>Tokens in / out</dt><dd className="num">{compact(tokensIn)} / {compact(tokensOut)}</dd>
            <dt>Per scored account</dt><dd className="num">${perAccount.toFixed(4)}</dd>
            <dt>Per 1,000 postings read</dt><dd className="num">${s.read ? ((costNow / s.read) * 1000).toFixed(2) : "0.00"}</dd>
          </dl>
          <div className="grid-2" style={{ gap: 8, marginTop: 10 }}>
            <label className="field">$ per 1M in<input className="input num" type="number" step={0.05} min={0} value={priceIn} onChange={(e) => setPriceIn(Number(e.target.value) || 0)} /></label>
            <label className="field">$ per 1M out<input className="input num" type="number" step={0.05} min={0} value={priceOut} onChange={(e) => setPriceOut(Number(e.target.value) || 0)} /></label>
          </div>
          <label className="field" style={{ marginTop: 8 }}>Manual research per account, minutes<input className="input num" type="number" min={1} max={120} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 20)} /></label>
          <p className="small muted" style={{ marginTop: 8 }}>Prices and minutes are assumptions to edit, not measurements.</p>
        </div>
      </div>
    </div>
  );
}
