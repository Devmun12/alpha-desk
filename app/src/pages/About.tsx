import { useDesk } from "../store";
import { date, n } from "../lib/format";

export function About() {
  const { desk, source } = useDesk();
  const s = desk.stats;
  return (
    <div className="page-inner" style={{ maxWidth: 920 }}>
      <div className="page-head">
        <h1>How Alpha Desk works</h1>
        <p className="lede">When a software company posts a job for a commissions analyst, it writes down, in public, how it pays its sales team today and what is breaking. Alpha Desk reads those posts every day, keeps the ones that describe a problem sales-comp, CPQ or planning software solves, and hands the right rep a first touch built from the company's own words.</p>
      </div>

      <div className="section grid-2">
        <div className="panel">
          <h3>Why this signal</h3>
          <p className="soft" style={{ marginTop: 6 }}>Intent tools catch accounts that are already researching vendors. A job post comes earlier: it is the moment a company decides to hire a person to run comp, quoting or planning. It is free public data, it names the tools in place (spreadsheets, an incumbent, Salesforce CPQ), and it peaks in the fourth quarter, when next year's comp plans get built.</p>
        </div>
        <div className="panel">
          <h3>What is real here</h3>
          <p className="soft" style={{ marginTop: 6 }}>The job posts, the AI readings, the scores and the drafts are real output of the pipeline, first run on {date(s.firstIngest)} across {n(s.boards)} companies. Rep actions on this page are recorded{source === "live" ? " in the pipeline database" : " in your browser"}. HubSpot and Slack are shown as the exact payloads they would receive; they are not connected. With no CRM connected, every company is treated as a prospect.</p>
        </div>
      </div>

      <div className="section">
        <h2>Guardrails</h2>
        <div className="grid-3" style={{ marginTop: 12 }}>
          <div className="panel"><h3>Evidence or nothing</h3><p className="soft small" style={{ marginTop: 6 }}>Every highlighted line is checked character for character against the posting, and against its label. The model's unverifiable quotes are dropped and counted, never shown.</p></div>
          <div className="panel"><h3>Drafts stay on a leash</h3><p className="soft small" style={{ marginTop: 6 }}>Each play lists the only claims a draft may make. Any number that is not in that material, or a quote that is not verbatim, flags the draft before a rep sees it.</p></div>
          <div className="panel"><h3>A control group from day one</h3><p className="soft small" style={{ marginTop: 6 }}>20% of qualifying accounts are held out by a stable hash, so the team can measure lift instead of guessing it. Every play carries a written rule for retiring it.</p></div>
        </div>
      </div>

      <div className="section">
        <h2>Architecture</h2>
        <div className="panel" style={{ marginTop: 12 }}>
          <dl className="kv">
            <dt>Sources</dt><dd>Public Greenhouse, Ashby and Lever posting APIs.</dd>
            <dt>Storage</dt><dd>Supabase Postgres: accounts, postings, signals, plays, events, runs. Scoring is a SQL view over a weights table.</dd>
            <dt>Jobs</dt><dd>One Deno edge function with routes for ingest, extract and draft, called by pg_cron through pg_net. Each job is single-flight and works in bounded batches.</dd>
            <dt>Model</dt><dd>Gemini Flash and Flash-Lite with JSON-schema output, model discovery and quota fallback.</dd>
            <dt>App</dt><dd>React and TypeScript, served as static files. It reads one JSON document from the API and falls back to a saved snapshot.</dd>
            <dt>Next</dt><dd>CRM sync for owners, customers and outcomes; a daily Slack digest; more sources such as LinkedIn jobs through a data provider; contact enrichment; prompt tests on every change.</dd>
          </dl>
        </div>
      </div>

      <div className="section">
        <p className="small muted">Built by Devesh. Company data is public job postings; no personal data is collected.</p>
      </div>
    </div>
  );
}
