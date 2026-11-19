import { useState } from "react";
import { analyze, LIVE_APP_URL, type AnalyzeResult } from "../data/load";
import { useDesk } from "../store";
import { Posting } from "../components/Posting";
import { SignalPill, copyText } from "../components/ui";
import { PLAY_BY_KEY } from "../../../supabase/functions/_shared/plays.ts";
import type { Signal } from "../types";
import { IconAlert, IconCheck } from "../components/icons";

export function Read() {
  const { source, toast } = useDesk();
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  const run = async () => {
    setBusy(true); setError(null); setResult(null);
    try { setResult(await analyze({ company, title, text })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

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
        <p className="lede">Paste any job posting and the same pipeline reads it live: the screen, the AI extraction, the word-for-word quote check, the play choice and a checked first draft. Nothing you paste is stored.</p>
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
          <button className="btn primary" disabled={busy || source === "snapshot" || !title.trim() || text.trim().length < 200} onClick={run}>{busy ? "Reading the posting…" : "Read posting"}</button>
          <span className="small muted">{text.trim().length < 200 ? "Paste at least a few paragraphs." : "Takes 10 to 25 seconds on the free model tier."}</span>
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
          {result.play && (
            <div className="play" style={{ marginTop: 16 }}>
              <div className="play-head"><div className="title"><h3>{PLAY_BY_KEY[result.play.playKey]?.name}</h3><span className="pill">{PLAY_BY_KEY[result.play.playKey]?.owner}</span></div><p className="soft">{result.play.why_now}</p></div>
              <div className="play-body">
                <div><b>{result.play.subject}</b></div>
                <div style={{ whiteSpace: "pre-wrap" }}>{result.play.email}</div>
                <div className="checks" style={{ color: result.play.checks.passed ? "var(--ok)" : "var(--warn)" }}>
                  {result.play.checks.passed ? <IconCheck /> : <IconAlert />}
                  {result.play.checks.passed ? <span>Checks passed, {result.play.checks.words} words.</span> : <span>Flagged: {result.play.checks.issues.join("; ")}</span>}
                </div>
                <div className="actions"><button className="btn" onClick={async () => toast((await copyText(`${result.play!.subject}\n\n${result.play!.email}`)) ? "Copied." : "Copy is blocked here.")}>Copy draft</button></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
