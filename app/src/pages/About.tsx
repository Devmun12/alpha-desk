import { useDesk } from "../store";
import { date, n } from "../lib/format";

export function About() {
  const { desk } = useDesk();
  const s = desk.stats;
  return (
    <div className="page-inner" style={{ maxWidth: 920 }}>
      <div className="page-head">
        <h1>How Alpha Desk works</h1>
        <p className="lede">When a software company posts a job for a commissions analyst, it writes down, in public, how it pays its sales team today and what is breaking. Alpha Desk reads those posts every day, keeps the ones that describe a problem sales-comp, CPQ or planning software solves, and hands the right rep a ranked morning brief and a first touch built from the company's own words, already read by a panel of simulated buyers.</p>
      </div>

      <div className="section grid-2">
        <div className="panel">
          <h3>Why this signal</h3>
          <p className="soft" style={{ marginTop: 6 }}>Intent tools catch accounts that are already researching vendors. A job post comes earlier: it is the moment a company decides to hire a person to run comp, quoting or planning. It is free public data, it names the tools in place (spreadsheets, an incumbent, Salesforce CPQ), and it peaks in the fourth quarter, when next year's comp plans get built.</p>
        </div>
        <div className="panel">
          <h3>What is real here</h3>
          <p className="soft" style={{ marginTop: 6 }}>The job posts, the AI readings, the scores and the drafts are real output of the pipeline, first run on {date(s.firstIngest)} across {n(s.boards)} companies. Your actions here (approve, dismiss, edit) change only what you see in this browser; they are logged as events but never alter the shared drafts, so every visitor starts from the same desk. HubSpot and Slack are shown as the exact payloads they would receive; they are not connected. With no CRM connected, every company is treated as a prospect.</p>
        </div>
      </div>

      <div className="section">
        <h2>Guardrails</h2>
        <div className="grid-3" style={{ marginTop: 12 }}>
          <div className="panel"><h3>Evidence or nothing</h3><p className="soft small" style={{ marginTop: 6 }}>Every highlighted line is checked character for character against the posting, and against its label. The model's unverifiable quotes are dropped and counted, never shown.</p></div>
          <div className="panel"><h3>Drafts stay on a leash</h3><p className="soft small" style={{ marginTop: 6 }}>Each play lists the only claims a draft may make. Any number that is not in that material, or a quote that is not verbatim, flags the draft before a rep sees it.</p></div>
          <div className="panel"><h3>Buyers read it first</h3><p className="soft small" style={{ marginTop: 6 }}>Three simulated buyers score every draft and name their objection. An editor rewrites it, and the rewrite ships only if the same panel scores it higher and it still passes the code checks.</p></div>
          <div className="panel"><h3>Customers are not prospects</h3><p className="soft small" style={{ marginTop: 6 }}>A seller profile lists the seller's product and known customers. A posting that names that product is read as a customer signal, not a competitor, and routes to the account owner.</p></div>
          <div className="panel"><h3>The model proposes, rules dispose</h3><p className="soft small" style={{ marginTop: 6 }}>The daily brief is ranked by the model from a rule-built shortlist. Code drops any account it cannot match and any reason with a number that is not in the facts.</p></div>
          <div className="panel"><h3>A control group from day one</h3><p className="soft small" style={{ marginTop: 6 }}>20% of qualifying accounts are held out by a stable hash, so the team can measure lift instead of guessing it. Every play carries a written rule for retiring it.</p></div>
        </div>
      </div>

      <div className="section">
        <h2>Architecture</h2>
        <div className="panel" style={{ marginTop: 12 }}>
          <dl className="kv">
            <dt>Sources</dt><dd>Public Greenhouse, Ashby and Lever posting APIs.</dd>
            <dt>Storage</dt><dd>Supabase Postgres: accounts, postings, signals, plays, events, runs. Scoring is a SQL view over a weights table.</dd>
            <dt>Jobs</dt><dd>Two Deno edge functions called by pg_cron through pg_net: one for the public API, ingest and extraction, one for the agent work (drafting with the buyer panel, and the daily brief). Each job is single-flight and works in bounded batches.</dd>
            <dt>Model</dt><dd>Gemini Flash and Flash-Lite with JSON-schema output, model discovery and quota fallback.</dd>
            <dt>App</dt><dd>React and TypeScript, served as static files. It reads one JSON document from the API and falls back to a saved snapshot.</dd>
            <dt>Next</dt><dd>A hand-labelled precision set and a judge for every prompt change; score calibration so the top tier is small; CRM sync for owners, customers and outcomes; a far larger account list, which is what the experiment needs to read out.</dd>
          </dl>
        </div>
      </div>

      <div className="section">
        <p className="small muted">Built by Devesh. Company data is public job postings; no personal data is collected.</p>
      </div>
    </div>
  );
}
