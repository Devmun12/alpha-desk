import { useMemo, useState } from "react";
import { useDesk } from "../store";
import { ago, compact, dateTime, duration, n, pct } from "../lib/format";
import { ATS } from "../data/taxonomy";
import { Seg, Stat } from "../components/ui";

const KIND: Record<string, string> = { ingest: "Read job boards", extract: "AI reads postings", draft: "Draft and review", analyze: "Live read", notify: "Notify", brief: "Daily brief" };

function summary(kind: string, st: Record<string, unknown>): string {
  const g = (k: string) => Number(st[k] ?? 0);
  if (kind === "ingest") return `${n(g("accounts"))} boards, ${n(g("postings"))} postings, ${n(g("newCandidates"))} new for the AI`;
  if (kind === "extract") return `${n(g("read"))} read, ${n(g("relevant"))} relevant, ${n(g("droppedQuotes"))} quotes dropped`;
  if (kind === "draft") return `${n(g("drafted"))} drafted, ${n(g("reviewed"))} read by the panel (mean ${g("panelMean") || "–"}), ${n(g("revised"))} rewritten, ${n(g("heldOut"))} held out`;
  if (kind === "brief") return `${n(g("items"))} items, ranked by ${st.source === "agent" ? "the model, checked by rules" : "rules"}`;
  if (kind === "analyze") return st.relevant ? "relevant" : "not relevant";
  return "";
}

export function Pipeline() {
  const { desk } = useDesk();
  const s = desk.stats;
  const [kind, setKind] = useState("all");
  const runs = useMemo(() => desk.runs.filter((r) => kind === "all" || r.kind === kind), [desk.runs, kind]);
  const models = useMemo(() => {
    const m: Record<string, number> = {};
    for (const x of desk.signals) m[x.model] = (m[x.model] ?? 0) + 1;
    for (const p of desk.plays) if (p.model) m[p.model] = (m[p.model] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [desk]);

  return (
    <div className="page-inner">
      <div className="page-head">
        <h1>Pipeline</h1>
        <p className="lede">Five steps on Supabase, then a daily brief. The scheduled jobs are small edge functions that pg_cron calls; each does one bounded batch and exits, so it fits the free tier's limits and picks up where the last run stopped. Drafting is paced to a few accounts every ten minutes to stay inside the free model quota.</p>
      </div>

      <div className="flow" aria-label="Pipeline stages">
        <div><span className="step-n">1</span><h3>Read the boards</h3><p>Every open role at {n(s.boards)} companies from public Greenhouse, Ashby and Lever boards. Closed roles are marked, not deleted.</p><span className="tech num">{n(s.postings)} open postings</span></div>
        <div><span className="step-n">2</span><h3>Screen for free</h3><p>Rules on title and body keep comp, RevOps, deal desk and planning roles and drop pay-transparency boilerplate.</p><span className="tech num">{n(s.candidates)} kept ({pct(s.candidates, s.postings, 1)})</span></div>
        <div><span className="step-n">3</span><h3>AI reads, code verifies</h3><p>Gemini returns schema-bound JSON. Every quote must appear verbatim in the post and match its label, or it is dropped.</p><span className="tech num">{n(s.read)} read, {n(s.relevant)} relevant</span></div>
        <div><span className="step-n">4</span><h3>Score in SQL</h3><p>Intent, fit and timing from a weights table anyone can edit. 20% of accounts go to a fixed control group.</p><span className="tech num">{n(desk.accounts.length)} accounts scored</span></div>
        <div><span className="step-n">5</span><h3>Draft, check, review</h3><p>One play per account. Code checks numbers and quotes; three simulated buyers score it; a rewrite ships only if they score it higher.</p><span className="tech num">{n(desk.plays.filter((p) => p.status !== "held_out").length)} drafts</span></div>
      </div>

      <div className="section stat-line">
        <Stat v={ago(s.lastIngest)} k="boards last read" />
        <Stat v={`${n(s.boardsFresh)} / ${n(s.boards)}`} k="boards read in the last 36 hours" />
        <Stat v={s.extractLatencyP50 ? `${(s.extractLatencyP50 / 1000).toFixed(1)}s` : "–"} k="median AI read time" />
        <Stat v={compact(s.extractTokensIn + s.draftTokensIn + s.extractTokensOut + s.draftTokensOut)} k="tokens used in total" />
      </div>

      <div className="section grid-2">
        <div className="panel">
          <h3>Sources</h3>
          <table className="data" style={{ marginTop: 10 }}>
            <thead><tr><th>Job board</th><th className="r">Companies</th><th className="r">Open postings</th></tr></thead>
            <tbody>{desk.coverage.map((c) => <tr key={c.ats}><td>{ATS[c.ats] ?? c.ats}</td><td className="r num">{n(c.boards)}</td><td className="r num">{n(c.postings)}</td></tr>)}</tbody>
          </table>
          <p className="small muted" style={{ marginTop: 10 }}>All three are the public posting APIs that power each company's own careers page: no scraping, no logins, no personal data.</p>
        </div>
        <div className="panel">
          <h3>Models and prompts</h3>
          <table className="data" style={{ marginTop: 10 }}>
            <thead><tr><th>Model</th><th className="r">Calls</th></tr></thead>
            <tbody>{models.map(([m, c]) => <tr key={m}><td>{m}</td><td className="r num">{n(c)}</td></tr>)}</tbody>
          </table>
          <p className="small muted" style={{ marginTop: 10 }}>Extraction prefers Flash-Lite and drafting prefers Flash; on a quota error the client falls back to the next model the key can call. The buyer panel always runs on Flash-Lite. Prompt versions: {[...new Set([...desk.signals.map((x) => x.promptVersion), ...desk.plays.map((x) => x.promptVersion)])].join(", ")}.</p>
        </div>
      </div>

      <div className="section panel">
        <div className="actions" style={{ marginBottom: 10 }}>
          <h3>Run log</h3>
          <span className="grow" />
          <Seg label="Stage" value={kind} onChange={setKind} options={[{ value: "all", label: "All" }, { value: "ingest", label: "Boards" }, { value: "extract", label: "AI reads" }, { value: "draft", label: "Drafts" }, { value: "brief", label: "Brief" }]} />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data">
            <thead><tr><th>Stage</th><th>Started</th><th className="r">Took</th><th>Result</th><th>Status</th></tr></thead>
            <tbody>
              {runs.slice(0, 30).map((r) => (
                <tr key={r.id}>
                  <td>{KIND[r.kind] ?? r.kind}</td>
                  <td className="num">{dateTime(r.startedAt)}</td>
                  <td className="r num">{duration(r.startedAt, r.finishedAt)}</td>
                  <td>{summary(r.kind, r.stats)}{r.error ? <span className="muted"> {r.error}</span> : ""}</td>
                  <td><span className={`pill ${r.status === "ok" ? "ok" : r.status === "running" ? "" : "warn"}`}>{r.status === "ok" ? "OK" : r.status === "partial" ? "Partial" : r.status === "running" ? "Running" : "Failed"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section panel">
        <h3>What the AI turned down</h3>
        <p className="sub" style={{ marginBottom: 10 }}>A sample of postings the screen let through but the model judged not to be buying signals. Showing the rejections is how a reviewer checks the precision claims.</p>
        <table className="data">
          <thead><tr><th>Company</th><th>Role</th><th>Why not</th></tr></thead>
          <tbody>{desk.rejected.slice(0, 15).map((r) => <tr key={r.id}><td>{r.company}</td><td>{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a> : r.title}</td><td className="soft">{r.summary}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
