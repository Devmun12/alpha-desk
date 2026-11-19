import { useState } from "react";
import { analyze, compose, LIVE_APP_URL, type AnalyzeResult, type ComposeResult } from "../data/load";
import { ReviewTrace } from "../components/PlayPanel";
import { useDesk } from "../store";
import { Posting } from "../components/Posting";
import { SignalPill, copyText } from "../components/ui";
import { PLAY_BY_KEY } from "../../../supabase/functions/_shared/plays.ts";
import type { Signal } from "../types";
import { IconAlert, IconCheck } from "../components/icons";

// An invented company and posting, so the page can be tried without hunting for one.
const EXAMPLE = {
  company: "Northwind Labs (invented example)",
  title: "Senior Sales Compensation Analyst",
  text: `About the role
Northwind Labs is hiring a Senior Sales Compensation Analyst to join our Revenue Operations team, reporting to the Director of Revenue Operations. Our sales team has doubled in the last year and now spans three regions.

What you will do
- Calculate monthly and quarterly commissions for 140 quota-carrying sellers. Today this is managed in Google Sheets with a lot of manual reconciliation against Salesforce.
- Own the monthly commission close with Finance, including accruals under ASC 340-40 and support for our SOX audit.
- Answer rep questions and resolve payout disputes, which currently arrive by email and Slack.
- Help design and roll out next fiscal year's compensation plans, including new accelerators and SPIFs.
- Partner with Deal Desk, which administers Salesforce CPQ, to make sure quote terms flow into commission calculations.

What we are looking for
- 4+ years in sales compensation, commissions or revenue operations at a software company.
- Advanced Excel or Google Sheets skills. Experience with a commission tool is a plus.
- Comfort working with Finance on audit controls.

Compensation and benefits
The base salary range for this role is $110,000 to $135,000. This role is eligible for an annual bonus. We are an equal opportunity employer.`,
};

export function Read() {
  const { source, toast } = useDesk();
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  const [play, setPlay] = useState<ComposeResult | null>(null);
  const [stage, setStage] = useState<"idle" | "reading" | "drafting">("idle");
  const [draftError, setDraftError] = useState<string | null>(null);

  // Two steps, shown as they finish: read and verify first, then draft and review.
  const run = async () => {
    setBusy(true); setError(null); setResult(null); setPlay(null); setDraftError(null); setStage("reading");
    try {
      const r = await analyze({ company, title, text });
      setResult(r);
      if (r.extraction.relevant && r.extraction.evidence.length) {
        setStage("drafting");
        try { setPlay(await compose(r.extraction, { company, title, text })); }
        catch (e) { setDraftError((e as Error).message); }
      }
    }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); setStage("idle"); }
  };
  const example = () => { setCompany(EXAMPLE.company); setTitle(EXAMPLE.title); setText(EXAMPLE.text); setResult(null); setPlay(null); setError(null); };

  const asSignal: Signal | null = result ? {
    id: 0, postId: 0, accountId: 0, title, department: null, location: null, url: null, postedAt: null,
    roleFamily: result.extraction.role_family, seniority: result.extraction.seniority, types: result.extraction.signal_types,
    products: result.extraction.products, tools: result.extraction.current_tools, evidence: result.extraction.evidence,
    facts: result.extraction.facts, summary: result.extraction.summary, confidence: result.extraction.confidence,
    model: result.model, promptVersion: "extract.v1", droppedQuotes: result.extraction.dropped_quotes, content: text,
  } : null;

  return (
    <div className="page-inner">
      <div className="page-head">
        <h1>Read a posting</h1>
        <p className="lede">Paste any job posting and the same pipeline reads it live, in two steps you can watch: the AI extraction with its word-for-word quote check, then the draft, the buyer panel and the rewrite. Nothing you paste is stored.</p>
      </div>

      {source === "snapshot" && (
        <div className="panel" style={{ marginBottom: 16, borderColor: "#f1e1b4", background: "#fffaf0" }}>
          <p>This copy of the app is a saved snapshot and cannot call the model. Live reading works on the deployed app: <a href={`${LIVE_APP_URL}#read`} target="_blank" rel="noreferrer">{LIVE_APP_URL}</a></p>
        </div>
      )}

      <div className="panel" style={{ display: "grid", gap: 14 }}>
        <div className="grid-2">
          <label className="field">Company<input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. a software company you are prospecting" /></label>
          <label className="field">Job title<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sales Compensation Analyst" /></label>
        </div>
        <label className="field">Posting text<textarea className="textarea" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the full description, responsibilities and requirements." /></label>
        <div className="actions">
          <button className="btn primary" disabled={busy || source === "snapshot" || !title.trim() || text.trim().length < 200} onClick={run}>{stage === "reading" ? "Reading the posting…" : stage === "drafting" ? "Drafting and running the buyer panel…" : "Read posting"}</button>
          <button className="btn" disabled={busy} onClick={example}>Use an example posting</button>
          <span className="small muted">{text.trim().length < 200 ? "Paste at least a few paragraphs, or use the example (an invented company)." : "About 5 seconds to read, then 15 to 25 for the draft and the panel."}</span>
        </div>
        {error && <p className="checks" style={{ color: "var(--bad)" }}><IconAlert /> {error}</p>}
      </div>

      {result && asSignal && (
        <div className="section">
          <div className="actions" style={{ marginBottom: 12 }}>
            <h2>{result.extraction.relevant ? "This is a buying signal" : "Not a buying signal"}</h2>
            <span className="grow" />
            <span className="small muted">Read by {result.model} in {(result.latencyMs / 1000).toFixed(1)}s, {result.inputTokens + result.outputTokens} tokens</span>
          </div>
          <p className="soft" style={{ marginBottom: 12 }}>{result.extraction.summary}</p>
          <div className="actions" style={{ marginBottom: 12 }}>
            {result.extraction.signal_types.map((t) => <SignalPill key={t} type={t} />)}
            {result.extraction.dropped_quotes > 0 && <span className="pill warn">{result.extraction.dropped_quotes} quote{result.extraction.dropped_quotes > 1 ? "s" : ""} dropped by the verifier</span>}
          </div>
          {result.extraction.relevant && <Posting signal={asSignal} />}
          {stage === "drafting" && <p className="soft" style={{ marginTop: 16 }}>Verified. Now drafting the play and putting it in front of three simulated buyers…</p>}
          {draftError && <p className="checks" style={{ color: "var(--warn)", marginTop: 16 }}><IconAlert /> The reading above is complete, but the draft step failed: {draftError}</p>}
          {play && (
            <div className="play" style={{ marginTop: 16 }}>
              <div className="play-head"><div className="title"><h3>{PLAY_BY_KEY[play.playKey]?.name}</h3><span className="pill">{PLAY_BY_KEY[play.playKey]?.owner}</span></div><p className="soft">{play.why_now}</p></div>
              <div className="play-body">
                <div><b>{play.subject}</b></div>
                <div style={{ whiteSpace: "pre-wrap" }}>{play.email}</div>
                <div className="checks" style={{ color: play.checks.passed ? "var(--ok)" : "var(--warn)" }}>
                  {play.checks.passed ? <IconCheck /> : <IconAlert />}
                  {play.checks.passed ? <span>Checks passed, {play.checks.words} words.</span> : <span>Flagged: {play.checks.issues.join("; ")}</span>}
                </div>
                {play.review && <ReviewTrace review={play.review} edited={false} />}
                <div className="actions"><button className="btn" onClick={async () => toast((await copyText(`${play.subject}\n\n${play.email}`)) ? "Copied." : "Copy is blocked here.")}>Copy draft</button></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
