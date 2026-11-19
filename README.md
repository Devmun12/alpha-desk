# Alpha Desk

**Hiring signals for revenue teams.** Alpha Desk reads every open job posting at 200+ US software companies, finds the ones where a company describes, in its own words, a problem that sales-compensation, CPQ or sales-planning software solves, and hands the right rep a scored account and a checked first touch.

**Live app:** https://devmun12.github.io/alpha-desk/

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

The desk shows the company's own posting in serif with the verified lines highlighted in place, the score broken down by rule, and the draft ready to edit, approve, copy or dismiss with a reason. Every action is an event, which drives the Impact page: funnel, adoption, precision, cost, and treatment-versus-control.

## Why it is built this way

| Decision | Reason |
|---|---|
| Public ATS APIs, not scraping | Stable JSON, no logins, no personal data, same content a candidate sees. |
| Rules before the model | ~3% of postings are worth reading; the screen is free and every rule that fires is stored for audit. |
| Verify every quote in code | A rep will paste the quote into an email. If the model invented it, the rep is embarrassed in front of a buyer. |
| Scoring in SQL, not in the model | Reps and managers can see and argue with every point; weights change without a deploy. |
| Holdout from day one | Lift is measured against accounts that got nothing, not guessed from activity counts. |
| Plays with kill rules | Each play states its success metric and when to retire it, so the catalog stays small. |
| Free-tier friendly | Each job is single-flight and works in bounded batches to fit edge-function CPU limits and model rate limits. |

## Architecture

- **Database:** Supabase Postgres. `accounts`, `job_posts`, `signals`, `plays`, `events`, `runs`; scoring views `v_signals`, `v_account_scores`; weights in `signal_weights` and `role_weights`. Row-level security is on with no policies: the only way in is the API function.
- **Jobs:** one Deno edge function, `api`, routes `/ingest`, `/extract` and `/draft` for pg_cron (via pg_net, authenticated by a secret held in Vault) and `/desk`, `/event`, `/analyze` and `/health` for the app.
- **Model:** Gemini Flash-Lite for extraction and Flash for drafting, discovered at runtime from the key's model list, with fallback across models on quota errors.
- **App:** React and TypeScript with Vite, deployed to GitHub Pages. It loads one JSON document from `/desk` and falls back to a snapshot that CI refreshes every six hours.

```
supabase/
  functions/api/index.ts          router: public API + internal jobs
  functions/_shared/              ats.ts (board adapters), prefilter.ts, extract.ts (prompt, schema, verifier),
                                  draft.ts (prompt, checks), plays.ts (catalog), llm.ts (Gemini client), jobs/*
  migrations/                     schema, auth, scoring, queue, desk API, schedules, screen v2
app/                              the desk (React + TypeScript)
pipeline/companies.py             target account list and slug guesses
docs/                             build log
```

## Run it yourself

1. Create a Supabase project and run the migrations in order (`supabase/migrations`). In `0003_pipeline_auth.sql`, set `project_url` to your project URL.
2. Add an edge function secret `GEMINI_API_KEY` (a free Google AI Studio key works). Optional: `GEMINI_MODELS` to pin models.
3. Deploy `supabase/functions/api` with JWT verification off (the function authenticates internal calls itself).
4. Seed `accounts` with names, domains and board slugs (see `pipeline/companies.py`). The schedules in `0007_schedules.sql` take it from there: boards refresh every 20 hours, the AI queue drains within minutes, and drafts follow.
5. App: `cd app && npm ci && VITE_API_BASE=https://<ref>.supabase.co/functions/v1/api npm run dev`.

## Tests

- `deno test supabase/functions/tests` covers the screen, the quote verifier and the draft checks.
- `cd app && npx tsc` type-checks the app; `node dev/shot.mjs` renders every page at desktop and phone widths for review.

## Limits

- Customer status, owners and outcomes come from a CRM that is not connected here, so every company is treated as a prospect and replies and meetings are logged by hand.
- Approved claims in the play catalog are capability statements. Replace them with verified proof before sending at volume.
- Coverage is the companies whose boards are on Greenhouse, Ashby or Lever. LinkedIn and Workday postings need a data provider.

Built by Devesh. Data is public job postings; no personal data is collected.
