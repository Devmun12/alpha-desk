# Alpha Desk

**Hiring signals for revenue teams.** Alpha Desk reads every open job posting at 200+ US software companies, finds the ones where a company describes, in its own words, a problem that sales-compensation, CPQ or sales-planning software solves, and hands the right rep a ranked morning brief, a scored account and a first touch that a panel of simulated buyers has already read.

**Live app:** https://bit.ly/AlphaDesk1 (https://devmun12.github.io/alpha-desk/)  
**Application note:** [docs/APPLICATION_NOTE.md](docs/APPLICATION_NOTE.md)

**Select portfolio (other things I have built):** https://bit.ly/devesh_pf ([docs/SELECT_PORTFOLIO.md](docs/SELECT_PORTFOLIO.md))

> A company hiring a "Sales Compensation Analyst" to *"calculate monthly commissions in Google Sheets"* has just told you its stack, its pain and its timing. Intent tools catch accounts already researching vendors; a job post comes earlier, at the moment the company decides to throw headcount at the problem.

## What it does

```
 Public job boards ──► 1. Read ──► 2. Screen ──► 3. AI reads ──► 4. Score ──► 5. Draft ──► Rep desk
 (Greenhouse, Ashby,    every open    free rules    schema-bound    SQL view     one play,    approve, send,
  Lever APIs)           posting       drop noise    JSON + verifier  + holdout    checked copy  log outcomes
```

1. **Read.** Every open role at each target company, from the public posting APIs that power their own careers pages. Closed roles are marked, not deleted, so hiring velocity is measurable.
2. **Screen.** Deterministic rules on title and body keep comp, RevOps, deal-desk, planning and GTM-systems roles, and ignore pay-transparency boilerplate ("eligible for commission") that appears on every sales posting. Quota-carrying sellers never reach the model.
3. **AI reads, code verifies.** Gemini returns JSON constrained by a schema: role family, ten signal types, tools named, evidence quotes, a one-line summary. Then code checks the model:
   - every quote must appear **verbatim** in the posting, and must match its label (a quote tagged "commissions run on spreadsheets" has to mention a spreadsheet or manual process);
   - a tool only counts if its name is in the posting;
   - a signal type survives only if a verified quote or tool supports it.
   Unverifiable quotes are dropped and counted, never shown.
4. **Score.** A SQL view combines intent (best evidence per signal type, weighted by who is being hired), fit (open sales roles) and timing (freshness) into 0–100, from a weights table anyone can edit. 20% of qualifying accounts are assigned to a fixed **control group** by a stable hash.
5. **Draft.** Each account gets one play from a catalog of seven (for example *Retire the spreadsheet*, *Incumbent swap*, *CPQ end-of-sale*). The model writes an email, a LinkedIn note and a call opener using only that play's approved claims; code then flags any number not in the approved material, any quote that is not verbatim, banned phrases and length.

6. **Review.** Three simulated buyers (a RevOps head, a controller, the hiring manager) read each draft, score how likely they are to reply from 1 to 5 and name their strongest objection. An editor rewrites the draft against the objections. The rewrite ships only if it passes the code checks and the same panel scores it higher than the first draft; a rewrite nobody has read never ships. The whole trace is shown to the rep.
7. **Brief.** Each morning rules shortlist the workable accounts and the model picks and orders five with a one-line reason each. Code drops any account it cannot match and any reason containing a number that is not in the facts, and falls back to the rule order if the model fails.

**Customers are not prospects.** A seller profile in the database names the seller's own product and known customers. A posting that names that product is read as a customer signal, not a competitor: the account leaves the outbound queue and the experiment and goes to its owner with the expansion play.

The desk shows the company's own posting in serif with the verified lines highlighted in place, the score broken down by rule, and the draft ready to edit, approve, copy or dismiss with a reason. Every action is an event, which drives the Impact page: funnel, adoption, precision, cost, and treatment-versus-control.

## Why it is built this way

| Decision | Reason |
|---|---|
| Public ATS APIs, not scraping | Stable JSON, no logins, no personal data, same content a candidate sees. |
| Rules before the model | ~3% of postings are worth reading; the screen is free and every rule that fires is stored for audit. |
| Verify every quote in code | A rep will paste the quote into an email. If the model invented it, the rep is embarrassed in front of a buyer. |
| Scoring in SQL, not in the model | Reps and managers can see and argue with every point; weights change without a deploy. |
| Holdout from day one | Lift is measured against accounts that got nothing, not guessed from activity counts. |
| Buyers read it before the rep | A draft can pass every code check and still be an email nobody answers. The panel gives the rep an editing list, and a rewrite has to beat the original to ship. |
| The model ranks, rules bound it | The brief needs judgement (what first, and why); the facts and the fallback stay in code. |
| Plays with kill rules | Each play states its success metric and when to retire it, so the catalog stays small. |
| Free-tier friendly | Each job is single-flight and works in bounded batches to fit edge-function CPU limits and model rate limits. |

## Architecture

- **Database:** Supabase Postgres. `accounts`, `job_posts`, `signals`, `plays`, `events`, `runs`; scoring views `v_signals`, `v_account_scores`; weights in `signal_weights` and `role_weights`. Row-level security is on with no policies: the only way in is the API function.
- **Jobs:** two Deno edge functions called by pg_cron (via pg_net, authenticated by a secret held in Vault). `api` serves `/ingest` and `/extract`, and `/desk`, `/event`, `/analyze` and `/health` for the app. `agent` serves `/draft` (write, check, buyer panel, rewrite) and `/brief`. They are separate so a slow model call cannot take the public read path down.
- **Model:** Gemini Flash-Lite for extraction and the buyer panel, Flash for drafting with Flash-Lite behind it. Models are discovered at runtime from the key's model list; every call has a timeout, a model that fails cools down for ten minutes, and the reason is written to the run log.
- **App:** React and TypeScript with Vite, deployed to GitHub Pages. It loads one JSON document from `/desk` and falls back to a snapshot that CI refreshes every six hours.

```
supabase/
  functions/api/index.ts          public API, ingest and extract
  functions/agent/index.ts        draft + buyer review panel, daily brief
  functions/_shared/              ats.ts (board adapters), prefilter.ts, extract.ts (prompt, schema, verifier),
                                  draft.ts (prompt, checks, review panel), plays.ts (catalog), llm.ts (Gemini client), jobs/*
  migrations/                     schema, auth, scoring, queue, desk API, schedules, screen v2, agent layer
app/                              the desk (React + TypeScript)
pipeline/companies.py             target account list and slug guesses
```

## Run it yourself

1. Create a Supabase project and run the migrations in order (`supabase/migrations`). In `0003_pipeline_auth.sql`, set `project_url` to your project URL.
2. Add an edge function secret `GEMINI_API_KEY` (a free Google AI Studio key works). Optional: `GEMINI_MODELS` to pin models.
3. Deploy `supabase/functions/api` and `supabase/functions/agent` with JWT verification off (the functions authenticate internal calls themselves).
4. Optional: insert one row into `seller_profile` with your product's names and known customers (see `0012_agent_review_brief_seller.sql`).
5. Seed `accounts` with names, domains and board slugs (see `pipeline/companies.py`). The schedules in `0007_schedules.sql` take it from there: boards refresh every 20 hours, the AI queue drains within minutes, and drafts follow.
6. App: `cd app && npm ci && VITE_API_BASE=https://<ref>.supabase.co/functions/v1/api npm run dev`.

## Tests

- `deno test supabase/functions/tests` (16 tests) covers the screen, the quote verifier, the draft checks, the rule for which draft version ships, the brief's guardrails and model fallback order.
- `cd app && npx tsc` type-checks the app; `node dev/shot.mjs` renders every page at desktop and phone widths for review.

## Limits

- Customer status comes from a short list in the seller profile and from postings that name the seller's product, not from a CRM. Owners and outcomes are not connected, so replies and meetings are logged by hand.
- Extraction precision has not been measured against hand labels yet, and the score puts too many accounts in the top tier. Both are the next things to build.
- The buyer panel is a simulation. Its scores rank drafts against each other; they are not a forecast of reply rates.
- Visitor actions on the live demo are logged but stay in the visitor's browser, so the shared desk cannot be changed from outside.
- Approved claims in the play catalog are capability statements. Replace them with verified proof before sending at volume.
- Coverage is the companies whose boards are on Greenhouse, Ashby or Lever. LinkedIn and Workday postings need a data provider.

Built by Devesh. Data is public job postings; no personal data is collected.
