import { useEffect, useRef, useState } from "react";
import type { Account, PlayRow, Review, Signal } from "../types";
import { PLAY_BY_KEY } from "../../../supabase/functions/_shared/plays.ts";
import { useDesk } from "../store";
import { hubspotPayload, slackAlert } from "../lib/integrations";
import { LIVE_APP_URL } from "../data/load";
import { copyText, Dialog, Seg } from "./ui";
import { IconAlert, IconCheck, IconCopy, IconLock, IconSlack, Mark } from "./icons";

type Channel = "email" | "linkedin" | "call";
const DISMISS = ["Not our ICP", "Already in a conversation", "Signal is wrong", "Bad timing"] as const;

export function PlayPanel({ account, play, signals }: { account: Account; play: PlayRow | undefined; signals: Signal[] }) {
  const { log, toast, source, desk } = useDesk();
  const review = play ? desk.reviews?.[play.id] : undefined;
  const [channel, setChannel] = useState<Channel>("email");
  const [subject, setSubject] = useState(play?.subject ?? "");
  const [body, setBody] = useState(play?.email ?? "");
  const [dialog, setDialog] = useState<null | "hubspot" | "slack" | "dismiss">(null);
  useEffect(() => { setSubject(play?.subject ?? ""); setBody(play?.email ?? ""); setChannel("email"); }, [play?.id, play?.subject, play?.email]);

  // Keyboard: A approve, C copy, D dismiss (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!play || dialog || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const k = e.key.toLowerCase();
      if (k === "a" && play.status === "draft") { e.preventDefault(); approveRef.current(); }
      if (k === "c") { e.preventDefault(); copyRef.current(); }
      if (k === "d" && play.status !== "sent" && play.status !== "dismissed" && play.status !== "held_out") { e.preventDefault(); setDialog("dismiss"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [play, dialog]);
  const approveRef = useRef<() => void>(() => {});
  const copyRef = useRef<() => void>(() => {});

  if (!play) {
    return (
      <div className="play locked">
        <h3>No play drafted yet</h3>
        <p className="soft">Plays are drafted for accounts scoring 35 or more. This account is scored but below that line, so no rep time is spent on it.</p>
      </div>
    );
  }

  const def = PLAY_BY_KEY[play.playKey];
  const ids = { accountId: account.id, playId: play.id };
  const edited = subject !== (play.subject ?? "") || body !== (play.email ?? "");
  const checks = "passed" in play.checks ? play.checks : null;
  const done = play.status === "sent" || play.status === "dismissed";

  if (play.status === "held_out") {
    return (
      <div className="play">
        <div className="play-head">
          <div className="title"><h3>{def?.name}</h3><span className="pill control"><IconLock /> Control group</span></div>
        </div>
        <div className="locked">
          <p>This account is in the 20% control group for the current experiment, so nobody contacts it from this tool. It is still scored, so the team can compare how often control accounts book meetings on their own against accounts that got the play.</p>
          <p className="small muted">Assignment is a stable hash of the account id. It cannot be changed from the desk.</p>
        </div>
      </div>
    );
  }

  const text = channel === "email" ? body : channel === "linkedin" ? play.linkedin ?? "" : play.callOpener ?? "";
  const statusPill = { draft: null, approved: <span className="pill ok">Approved</span>, sent: <span className="pill ok">Sent</span>, dismissed: <span className="pill">Dismissed</span>, held_out: null }[play.status];

  const approve = () => {
    if (edited) log("edited", ids, { subject, email: body });
    log("approved", ids, { channel });
    setDialog("hubspot");
  };
  const copy = async () => {
    const ok = await copyText(channel === "email" ? `${subject}\n\n${body}` : text);
    toast(ok ? "Copied." : "Copy is blocked here. Select the text and copy it manually.");
  };
  approveRef.current = approve;
  copyRef.current = copy;

  return (
    <section className="play" aria-label="Recommended play">
      <div className="play-head">
        <div className="title">
          <h3>{def?.name ?? play.playKey}</h3>
          <span className="pill">{def?.product}</span>
          <span className="pill">{def?.motion}</span>
          {account.crmStatus === "customer" && <span className="pill customer">Existing customer</span>}
          {statusPill}
        </div>
        <p className="soft">{def?.angle}</p>
      </div>
      <div className="play-body">
        <div className="play-grid">
          <div><b>Owner</b>{def?.owner}</div>
          <div><b>Who to contact</b>{play.persona}</div>
          <div><b>Why this week</b>{play.whyNow}</div>
        </div>

        <div className="compose">
          <div className="actions">
            <Seg label="Channel" value={channel} onChange={setChannel} options={[{ value: "email", label: "Email" }, { value: "linkedin", label: "LinkedIn note" }, { value: "call", label: "Call opener" }]} />
            <span className="grow" />
            <span className="small muted">Drafted by {play.model}</span>
          </div>
          {channel === "email" ? (
            <>
              <label className="field">Subject
                <input className="input subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={done} />
              </label>
              <label className="field">Email
                <textarea className="textarea" rows={9} value={body} onChange={(e) => setBody(e.target.value)} disabled={done} />
              </label>
            </>
          ) : (
            <textarea className="textarea" rows={channel === "call" ? 3 : 4} value={text} readOnly aria-label={channel === "linkedin" ? "LinkedIn note" : "Call opener"} />
          )}
          {checks && (
            <div className="checks" style={{ color: checks.passed ? "var(--ok)" : "var(--warn)" }}>
              {checks.passed ? <IconCheck /> : <IconAlert />}
              {checks.passed ? (
                <span>Checks passed: every number traces to approved proof, the quoted phrase is verbatim from the posting, {checks.words} words.</span>
              ) : (
                <div><span>Needs a look before sending:</span><ul>{checks.issues.map((i) => <li key={i}>{i}</li>)}</ul></div>
              )}
            </div>
          )}
          {review && review.rounds.length > 0 && <ReviewTrace review={review} edited={edited} />}
        </div>

        <div className="actions">
          {play.status === "draft" && <button className="btn primary" onClick={approve} title="Shortcut: A">Approve and log to HubSpot</button>}
          {play.status === "approved" && <button className="btn primary" onClick={() => { log("sent", ids, { channel }); toast(`Marked as sent. ${account.name} moves to waiting for reply.`); }}>Mark as sent</button>}
          {play.status === "sent" && (
            <>
              <span className="small soft">Log the outcome:</span>
              <button className="btn sm" onClick={() => { log("replied", ids); toast("Reply logged."); }}>Replied</button>
              <button className="btn sm" onClick={() => { log("meeting", ids); toast("Meeting logged. It counts toward this play's scoreboard."); }}>Meeting booked</button>
              <button className="btn sm" onClick={() => { log("opportunity", ids); toast("Opportunity logged."); }}>Opportunity created</button>
            </>
          )}
          <button className="btn" onClick={copy} title="Shortcut: C">
            <IconCopy /> Copy
          </button>
          <button className="btn" onClick={() => setDialog("slack")}><IconSlack /> Slack alert</button>
          <span className="grow" />
          {!done && <button className="btn ghost danger" onClick={() => setDialog("dismiss")} title="Shortcut: D">Dismiss</button>}
        </div>
      </div>

      {dialog === "hubspot" && (
        <Dialog title="Approved and logged" onClose={() => setDialog(null)} footer={<button className="btn primary" onClick={() => setDialog(null)}>Done</button>}>
          <p>The play is approved{source === "live" ? " and the event is logged" : " in this browser"}. HubSpot is not connected in this demo, so here is the exact request the connector sends: the company gets the score and play as properties, and the owner gets a task with the draft.</p>
          <pre className="code">{JSON.stringify(hubspotPayload(account, play, subject, body), null, 2)}</pre>
        </Dialog>
      )}
      {dialog === "slack" && (
        <Dialog title="Slack alert preview" onClose={() => setDialog(null)} footer={<button className="btn primary" onClick={() => setDialog(null)}>Close</button>}>
          <p className="soft">Posted to the owner's channel when an account first crosses 70, and summarised in the daily digest. This is the Block Kit message the notifier sends.</p>
          <SlackPreview account={account} play={play} signals={signals} />
          <details><summary className="small muted">Block Kit JSON</summary><pre className="code">{JSON.stringify(slackAlert(account, signals, play, LIVE_APP_URL), null, 2)}</pre></details>
        </Dialog>
      )}
      {dialog === "dismiss" && (
        <Dialog title={`Dismiss ${account.name}?`} onClose={() => setDialog(null)}>
          <p className="soft">The reason trains the scoring rules. "Signal is wrong" also marks the AI's reading as incorrect, which shows up as precision on the Impact page.</p>
          <div className="actions">
            {DISMISS.map((r) => (
              <button key={r} className="btn" onClick={() => {
                log("dismissed", ids, { reason: r });
                if (r === "Signal is wrong") for (const s of signals) log("signal_down", { accountId: account.id, signalId: s.id }, { reason: r });
                setDialog(null);
                toast(`Dismissed: ${r.toLowerCase()}.`);
              }}>{r}</button>
            ))}
          </div>
        </Dialog>
      )}
    </section>
  );
}

const DECISION: Record<Review["decision"], string> = {
  passed_first_time: "Every buyer scored the first draft 4 or higher and the code checks passed, so nothing was rewritten.",
  rewrite_scored_higher: "The panel scored the rewrite higher than the first draft, so the rewrite is the text above.",
  rewrite_scored_no_better: "The panel scored the rewrite no higher than the first draft, so the rewrite was thrown away and the first draft stands.",
  rewrite_failed_checks: "The editor's rewrite broke a code check (for example a number that is not in the approved material), so it was thrown away and the first draft stands.",
  rewrite_fixed_checks: "The first draft failed a code check and the rewrite passed, so the rewrite is the text above.",
  no_rewrite_offered: "The editor had nothing better to offer, so the first draft stands.",
  out_of_time: "The run reached its time limit before the panel could read the rewrite. A rewrite nobody has read never ships, so the first draft stands.",
};

/** What the simulated buyers said, round by round, and what the loop decided. */
export function ReviewTrace({ review, edited }: { review: Review; edited: boolean }) {
  if (!review.decision) return null; // an older review format: nothing reliable to show
  const improved = review.shipped === 1 && review.mean > review.firstMean;
  return (
    <details className="review" open>
      <summary>
        <b>Buyer review panel</b>
        <span className={`pill ${review.mean >= 4 ? "ok" : review.mean >= 3 ? "" : "warn"}`}>{review.mean.toFixed(1)} of 5 likely to reply</span>
        <span className="small muted">{improved ? `up from ${review.firstMean.toFixed(1)} after one rewrite` : review.rounds.length === 2 ? "rewrite tried, first draft kept" : "one round"}</span>
      </summary>
      <p className="small soft">Three simulated buyers read the draft before you did and scored how likely they are to reply: 2 is "read and ignored", 4 is "would probably reply". They are told to be hard to impress. Treat the objections as an editing list, not a forecast.</p>
      {review.rounds.map((r) => (
        <div className="round" key={r.round}>
          <div className="small muted">Round {r.round}: the panel read the {r.version === 0 ? "first draft" : "rewrite"} and scored it {r.mean.toFixed(1)} ({r.model})</div>
          <ul className="verdicts">
            {r.verdicts.map((v) => (
              <li key={v.buyer} className={v.score >= 4 ? "yes" : v.score <= 2 ? "no" : ""}>
                <span className="who">{v.buyer}</span>
                <span className="call num">{v.score} / 5</span>
                <span className="say">{v.objection}</span>
              </li>
            ))}
          </ul>
          {r.round === 1 && r.note && review.decision !== "passed_first_time" && <p className="small soft"><b>Editor:</b> {r.note}</p>}
        </div>
      ))}
      <p className="small soft"><b>Decision:</b> {DECISION[review.decision]}</p>
      {edited && <p className="small soft"><b>You have edited this draft</b> since the panel read it.</p>}
      {review.other && (
        <details className="first">
          <summary className="small">Show the {review.other.version === 0 ? "first draft" : "rewrite"} that did not ship{review.other.mean != null ? ` (scored ${review.other.mean.toFixed(1)})` : ""}</summary>
          <div className="source-text" style={{ fontSize: 14 }}><b>{review.other.subject}</b>{"\n\n"}{review.other.email}</div>
        </details>
      )}
    </details>
  );
}

function SlackPreview({ account, play, signals }: { account: Account; play: PlayRow; signals: Signal[] }) {
  const def = PLAY_BY_KEY[play.playKey];
  const top = signals[0];
  return (
    <div className="slack">
      <div className="av"><Mark size={26} /></div>
      <div>
        <div className="who">Alpha Desk <span>APP</span></div>
        <div style={{ fontWeight: 700, marginTop: 2 }}>{account.name}: {account.score}/100</div>
        <div><b>{def?.name}</b> for {def?.owner}</div>
        {top && <div>Hiring: <span style={{ color: "#1264a3" }}>{top.title}</span></div>}
        {top?.evidence[0] && <blockquote>{top.evidence[0].quote}</blockquote>}
        <div className="sbtns"><span className="p">Open in Alpha Desk</span><span>Not a fit</span></div>
      </div>
    </div>
  );
}
