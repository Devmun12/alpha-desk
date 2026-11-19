# Alpha Desk handoff

This file is for an AI assistant (or a person) taking over this project mid-flight. Read it top to bottom before you change anything. Status figures are from **2026-11-19 18:34 UTC**.

---

## 1. What this is and why it exists

**Owner:** Devesh (GitHub `Devmun12`). He is an ISB PGP student who previously worked in IT program delivery at DHL Express.

**Goal:** a submission for the **Growth Engineer** role at **Everstage**. Everstage sells sales-commission (incentive comp), CPQ and sales-planning software, plus "Eva", an AI teammate, mostly to US software companies. The first interview step is *"Application review: your build and your note"*. He asked for "the strongest submission for this JD… production ready… a design system that is not generic".

**The product, Alpha Desk:**
- An AI agent reads every open posting on the public job boards of about 300 US software companies.
- It finds postings that reveal a need for comp, CPQ or planning software, for example:
  - "commissions are calculated in Google Sheets"
  - "administer Salesforce CPQ"
  - "hiring our first Head of RevOps"
- It checks that every quote it extracts appears word for word in the posting.
- It scores each account and holds 20% back as a control group.
- It picks one of seven sales plays and drafts a first touch: email, LinkedIn note and call opener. The drafts go through automatic checks.
- A rep "desk" web app sits on top. Reps approve, edit, dismiss and log outcomes there, and an Impact page compares treatment with holdout.

**How it maps to the JD.** The JD asks the candidate to:
- find "alphas" (low-hanging, high-ROI opportunities) in the revenue chain,
- build agents and pipelines,
- launch quickly, track adoption and retire what doesn't work.

The JD's own examples are "Buying-interest alerts" and "BDR Brief: every rep's day, sorted". Alpha Desk is a hiring-signal version of both. It has kill rules per play, a holdout experiment and an outcome log.

**Hard rule: the app itself is vendor-neutral.** The user asked for every Everstage mention to be removed from the app, prompts, plays, backend and repo. Don't add any back. The *application note* (not yet written) may address Everstage directly.

**JD source:** the PDF was uploaded in the original chat. The key text is summarised above. Role contacts named in the JD are Abhishek GP (SVP Growth & Marketing) and Poojithaa Kalyanaraman (TA). Interview step 3 is a working session that walks "GP and a GTM engineer" through the build.

---

## 2. Ground rules from the user (do not break these)

1. **No secrets in chat, code or commits.**
   - The Gemini key lives only in the Supabase edge-function secret `GEMINI_API_KEY`. The user set it himself.
   - The pipeline secret lives only in Supabase Vault.
2. **No destructive SQL (DELETE, DROP, TRUNCATE) without the user's explicit OK.** When outputs need replacing, bump the prompt version (for example `extract.v2` → `extract.v3`). Old rows stay, and the views pick the latest version.
3. **Keep the app generic.** No Everstage branding or claims in the product. Approved claims in `plays.ts` are worded as capability statements and marked "replace with verified proof".
4. **Commit as** `Devesh <Devmun12@users.noreply.github.com>` on `main` of `github.com/Devmun12/alpha-desk`.
5. Don't invent numbers, customers or results anywhere: the app, the note or the README.

---

## 3. Links

| What | Where |
|---|---|
| Repo | https://github.com/Devmun12/alpha-desk (public) |
| Live app | https://devmun12.github.io/alpha-desk/ (Pages is now enabled from the `gh-pages` branch, root. **Not yet verified in a browser.**) |
| Public API | `https://bxtfkbifeirwebfytpax.supabase.co/functions/v1/api` |
| Desk JSON | `GET …/api/desk` (add `?download=1` for a file download) |
| Health | `GET …/api/health` |
| Force snapshot mode in the app | append `?source=snapshot` to the app URL |
| Supabase project | ref `bxtfkbifeirwebfytpax`, URL `https://bxtfkbifeirwebfytpax.supabase.co` (owned by Devesh's Supabase account, free tier) |

---

## 4. Architecture

```
pg_cron (every 1–2 min)
   └─ ops.invoke('api/<job>', body)  ── pg_net POST + x-pipeline-secret (from Vault)
         └─ Edge function `api` (Deno, verify_jwt=false)
              ├─ /ingest   read Greenhouse / Lever / Ashby boards → job_posts
              ├─ /extract  Gemini reads candidate postings → signals (quotes verified)
              └─ /draft    score → choose play → Gemini drafts → checks → plays
Postgres views: v_signals (latest prompt version per post) → v_account_scores (score, tier, holdout)
RPC get_desk() → one JSON document → React app (GitHub Pages)
App writes rep actions → POST /api/event → events table
```

### The funnel, stage by stage

1. **Ingest** (`_shared/jobs/ingest.ts`, `_shared/ats.ts`)
   - Uses public, unauthenticated board APIs:
     - Greenhouse: `boards-api.greenhouse.io/v1/boards/{slug}/jobs`, plus `/jobs/{id}` for each body
     - Lever: `api.lever.co/v0/postings/{slug}?mode=json`
     - Ashby: `api.ashbyhq.com/posting-api/job-board/{slug}`
   - Keeps metadata for every posting; sales-role counts feed the "fit" score. Bodies are kept only for prefilter candidates.
   - Postings that disappear get marked closed.
   - Runs 8 boards per tick with a pool of 2, because the free tier allows about 2s of CPU per request. The 20h staleness window means each board is re-read about daily.
2. **Prefilter and screen** (`_shared/prefilter.ts`, SQL `screen_ok` / `screen_priority` in 0008)
   - Deterministic regex rules on the title, plus conditional body rules.
   - A quota-carrying sales role (AE, SDR, SE…) never counts as a signal on its own.
   - Pay-transparency boilerplate ("eligible for commission") is deliberately not matched.
   - A vendor's own name is stripped from its own postings.
   - Every rule that fires is stored in `job_posts.prefilter` so a reviewer can see why a posting was read.
3. **Extract** (`_shared/extract.ts`, prompt `extract.v2`)
   - Gemini returns output constrained by a JSON schema: `relevant`, `role_family`, `seniority`, `signal_types` (10 types), `products`, `current_tools`, `evidence` quotes and `facts`.
   - `verify()` then applies these checks:
     - It drops any quote not found verbatim in the posting. The comparison is whitespace- and punctuation-tolerant, but no words may change.
     - **Label guards** drop quotes whose text doesn't support their label. For example, a `spreadsheet_comp` quote must mention excel, sheets, a spreadsheet or "manual".
     - It keeps only tools whose name appears in the text, canonicalised.
     - It keeps a signal type only if a verified quote or a named tool supports it.
   - Runs five paced workers per tick (lease-protected). Model choice prefers Flash-Lite and falls back to another model on a 429.
4. **Score** (SQL view `v_account_scores`, migration 0004 and redefined in 0009)
   - Score = intent (≤60) + fit (≤25) + timing (≤15).
     - Intent sums per-signal points × the role multiplier × confidence.
     - Fit is `6·ln(1+sales_roles)`.
     - Timing depends on freshness.
   - Tiers: A ≥70, B ≥50, otherwise C.
   - Holdout: `abs(hashtext('ad-exp-1:'||account_id)) % 5 = 0`, so assignment is deterministic and 20% of accounts are held out. **Don't change the salt now**, or experiment assignment changes.
5. **Play choice** (`_shared/plays.ts`)
   - Seven plays: retire-the-spreadsheet, incumbent-swap, cpq-end-of-sale, deal-desk-load, capacity-build, new-leader-90, expand-account.
   - Customers always get expand-account.
   - `cpq_legacy` or `icm_incumbent` wins the play if it scores within 6 points of the top signal.
   - Each play has a trigger, persona, angle, CTA, approved claims, guardrails, a success metric and a kill rule.
6. **Draft** (`_shared/draft.ts`, prompt `draft.v1`, `_shared/jobs/draft.ts`)
   - Waits until the extraction backlog is empty, then drafts accounts with score ≥35.
   - Holdout accounts get a `plays` row with status `held_out` and no copy.
   - `checkDraft` enforces:
     - an email of 45–130 words and a subject of 6 words or fewer
     - a LinkedIn note under 300 characters
     - no banned phrases ("hope this finds you", "quick question", "!", …)
     - every number must appear in the approved material
     - `quote_used` must be verbatim from the posting and at most about 12 words
     - a `{{first_name}}` placeholder must be present
   - Placeholders are `{{first_name}}`, `{{sender_name}}` and `{{sender_company}}`.

### Single-flight

Scheduled jobs take a lease (`acquire_lease` / `release_lease`, table `ops.job_leases`, migration 0010). A tick that finds a live lease returns `{"skipped": "... already running"}`. Targeted runs (with `postIds` or `accountIds`) skip the lease. Runs left `running` for more than 5 minutes get marked `error: timed out`.

---

## 5. Repo map

```
.github/workflows/deploy.yml   on push to main, every 6h and manually: npm ci → tsc → curl /api/desk into app/public/snapshot.json → vite build → gh-pages (force_orphan)
README.md                      public write-up (what, why, architecture, run it, tests, limits)
HANDOFF.md                     this file
pipeline/companies.py          seed list of ~300 US software companies and ATS slugs (CUSTOMERS = empty set, everything is a prospect)
pipeline/discover_boards.sql   how board slugs were discovered and recorded
supabase/migrations/           0001–0011, see the caveat in §7
supabase/functions/api/index.ts          the only live edge function; a router for public and internal routes
supabase/functions/_shared/db.ts         admin client, cors, json, pool, startRun/finishRun, isInternal, withLease
supabase/functions/_shared/ats.ts        board adapters, htmlToText (Greenhouse double-encodes HTML)
supabase/functions/_shared/prefilter.ts  title and body rules
supabase/functions/_shared/llm.ts        Gemini client: models.list discovery, schema output, fallback across models
supabase/functions/_shared/extract.ts    extraction prompt, schema, verify(), label guards
supabase/functions/_shared/draft.ts      drafting prompt, checkDraft()
supabase/functions/_shared/plays.ts      play catalog and choosePlay(); also imported by the app (see app/tsconfig.json)
supabase/functions/_shared/jobs/{ingest,extract,draft}.ts   job handlers
supabase/functions/tests/pipeline.test.ts  9 Deno tests (prefilter, verifyQuote, verify guards, checkDraft, choosePlay…)
app/                           Vite 5 + React 18 + TypeScript, hash router, no UI library
  src/types.ts                 the Desk JSON contract (mirrors get_desk())
  src/store.tsx                DeskProvider / useDesk / useRoute / go(); optimistic events in localStorage key ad.local-events.v1
  src/data/load.ts             live API → ./snapshot.json fallback → embedded snapshot (single-file mode); postEvent; analyze
  src/data/snapshot.json       committed as `null` placeholder; filled only for build:single
  src/lib/highlight.ts         finds verified quotes in the posting text for highlighting
  src/lib/integrations.ts      Slack Block Kit preview, HubSpot payload (ad_* properties); previews only, no live sends
  src/components/PlayPanel.tsx draft review: A/C/D keys, approve → HubSpot dialog, Slack preview, dismiss reasons, outcomes
  src/pages/Desk.tsx           main queue; j/k navigation; views Ready / All / Customers / Control
  src/pages/{Plays,Impact,Pipeline,Read,About}.tsx
  dev/fixture.mjs              invented demo companies for local dev only, never shipped
  dev/shot.mjs                 Playwright screenshots (uses ?source=snapshot)
```

### Design system (keep it; the user asked for a non-generic one)

- **Colours:**
  - cool grey paper `#eef1f5`, white surfaces, navy ink `#14213d`
  - highlighter colours by signal family: comp yellow, rival (incumbent tools) pink, CPQ green, planning blue, leadership violet
- **Type:** Bricolage Grotesque for the UI; Source Serif 4 **only** for verbatim posting text. Fonts are self-hosted latin woff2 via fontsource.
- **Signature element:** `mark.hl`, a marker-stroke highlight over verified quotes inside the posting text. Spend boldness there and keep everything else quiet.

---

## 6. Infrastructure state

### Edge functions

- `api` is live: version 3, `verify_jwt=false`, entrypoint `api/index.ts`. Deployed 2026-11-19 ~18:31 UTC with the lease and concurrency changes.
- Old functions `ingest`, `extract`, `draft` and `health` are **still deployed but unused**. Deleting them is cleanup that needs the user's OK.

### Secrets

| Name | Where | Status |
|---|---|---|
| `GEMINI_API_KEY` | edge secret | set |
| `pipeline_secret`, `project_url` | Vault | used by `ops.invoke` and `pipeline_secret_ok` |

Never print these.

### Cron (`cron.job`)

| Job | Schedule | Command |
|---|---|---|
| ad-ingest | `* * * * *` | `ops.invoke('api/ingest','{"limit": 8}')` |
| ad-extract | `* * * * *` | `ops.invoke('api/extract','{"limit":40,"concurrency":5,"gapMs":3000}')` |
| ad-draft | `*/2 * * * *` | `ops.invoke('api/draft','{"limit": 12}')` |

### Database objects

- **Tables:** `accounts`, `job_posts`, `signals`, `plays`, `events`, `runs`, `signal_weights`, `role_weights`, `ops.job_leases`, `ops.probe` (scratch).
- **Views:** `v_signals`, `v_account_scores`.
- **Functions:** `get_desk`, `log_event` (rate-limited to 600/h), `extract_queue(p_version, p_limit)`, `screen_ok`, `screen_priority`, `pipeline_secret_ok`, `acquire_lease`, `release_lease`, `ops.invoke`.
- RLS is on with no policies: anon can't read tables, and everything public goes through the `api` function using the service role.

### Pipeline numbers at 18:34 UTC

| Metric | Value |
|---|---|
| Accounts | 296 (212 with a readable board) |
| Open postings | 17,798 |
| Candidates | 583 by prefilter; about 359 eligible after screen v2 |
| `extract.v2` reads | 77, of which 76 relevant |
| v2 queue | 282 left, draining at about **20/min** since the redeploy (run 90: 30 read in 90s, 0 errors; was about 6.5/min) |
| Scored accounts | 63, of which 56 have score ≥35 (drafting candidates) |
| Plays | 0, because drafting waits for the extraction queue to empty. Expect it to start around 18:50 UTC and to draft about 45 accounts (56 minus the ~20% holdout) over ~10 minutes. |
| Older rows | `extract.v1` rows (88 read) are superseded by v2 in `v_signals`. They stay in the table, so don't delete them. |

---

## 7. How to work on it

### Local

```bash
# app
cd app && npm ci
npm run dev            # http://localhost:5173, reads the live API by default
npm run typecheck
npm run build          # dist/
npm run build:single   # dist-single/index.html with the snapshot embedded (write src/data/snapshot.json first)

# backend tests
deno test supabase/functions/tests      # 9 tests, all passing at handoff
```

`app/.env.example` documents `VITE_API_BASE` and `VITE_LIVE_URL`. The defaults point at the reference deployment.

### Deploying the edge function

You need the Supabase CLI logged in to Devesh's account (`supabase login`). Ask him to do this; don't ask for his token in chat.

```bash
supabase functions deploy api --project-ref bxtfkbifeirwebfytpax --no-verify-jwt
```

### Migrations caveat

The files in `supabase/migrations/` (0001–0011) are an accurate record of what was applied. Production, however, recorded them under timestamp versions, because they were applied through an API rather than the CLI. **Don't run `supabase db push`**: it would try to re-apply everything. Instead:
1. Run new SQL in the Supabase dashboard's SQL editor (or with psql).
2. Save the same SQL as `0012_<name>.sql` and onwards.
3. Non-destructive changes only, unless the user OKs it (§2).

### Triggering a job by hand

Run this in the SQL editor; the secret never leaves the database.

```sql
select ops.invoke('api/extract', '{"limit":40,"concurrency":5,"gapMs":3000}'::jsonb);
select ops.invoke('api/draft',   '{"limit":12}'::jsonb);
select ops.invoke('api/draft',   '{"accountIds":[123]}'::jsonb);   -- targeted, skips the lease
```

### Monitoring queries

```sql
-- progress
select (select count(*) from extract_queue('extract.v2', 1000)) as queue,
       (select count(*) from signals where prompt_version = 'extract.v2') as read_v2,
       (select count(*) from plays) as plays,
       (select count(*) from plays where status = 'draft' and (checks->>'passed')::bool) as drafts_passing;

-- last runs
select id, kind, status, started_at, finished_at, stats from runs order by id desc limit 10;

-- spot-check extraction precision
select a.name, v.title, v.signal_types, v.confidence, v.summary, v.evidence
from v_signals v join accounts a on a.id = v.account_id
where v.relevant order by random() limit 20;

-- spot-check drafts
select a.name, p.play_key, p.subject, p.email, p.quote_used, p.checks
from plays p join accounts a on a.id = p.account_id
where p.status = 'draft' order by p.id desc limit 10;
```

---

## 8. What's left, in priority order

### P0: make sure the link works

1. Open https://devmun12.github.io/alpha-desk/.
   - **Expected:** the Desk loads with real accounts, and no "snapshot" banner appears (the banner means the live API failed).
   - **If you get a 404:** check the latest Actions run and Settings → Pages (source: `gh-pages`, `/ (root)`).
2. When drafting has finished (`plays` > 0), re-run the deploy workflow (Actions → "Build and deploy the app" → Run workflow). That refreshes `snapshot.json` with real drafts.

### P1: quality before anyone sees it

3. **Extraction precision looks suspiciously high.** v2 marked 76 of 77 postings relevant. Either screen v2 is doing the precision work, or the model is too lenient.
   - Sample about 30 relevant signals with the query above and judge each one: would a seller act on it?
   - If there are clear false positives (generic RevOps IC roles, pay boilerplate, the vendor's own postings), tighten the prompt rules or add label guards. Then bump `EXTRACT_VERSION` to `extract.v3` and let the queue re-read. Don't delete v2.
   - Record the measured precision; it's a strong line for the note.
4. **Draft quality.** Check the share of drafts with `checks.passed`. Read 10 drafts for:
   - tone (plain, specific, no hype)
   - a verbatim quote
   - no invented numbers
   - the right play for the signal

   If the copy is weak, edit `draft.ts`, bump `DRAFT_VERSION` and re-draft.
5. **UI QA with real data** at 1440px and 390px wide (`node app/dev/shot.mjs`, or a browser). Check every page:
   - Desk, Plays, Impact, Pipeline, Read, About
   - the empty states
   - the mobile layout
   - keyboard shortcuts (j/k, A/C/D)
   - the approve → HubSpot dialog
   - the Slack preview
   - the "Read a posting" live analyze page (rate-limited to 40/h)

   Fix overflow and label collisions.
6. **`docs/BUILD_LOG.md`.** An honest iteration log with numbers. Material so far:
   - **CPU limit:** the first ingest (16 boards in parallel, fetching bodies) hit the free-tier "CPU Time exceeded" (546) error. Fixed with a title screen before fetching bodies, Greenhouse bodies fetched per job, single-flight small batches and a pool of 2.
   - **Pay-transparency boilerplate:** the first prefilter matched it on nearly every sales posting. The body rules were narrowed to operational comp language, and self-mentions get stripped.
   - **Mislabelling (the rejected AI output):** the model labelled "variable compensation" as `spreadsheet_comp`. That led to the label guards in `verify()`. Use this as the clear "AI output I rejected" example.
   - **Screen v1 → v2:** 218 territory and sales roles were going to the model at 0% relevance. Screen v2 stopped sending quota-carrying roles.
   - **Vendor-neutral prompt:** v1 → v2 when the app was made generic.
   - **Race condition:** two extract runs could start at once. Fixed with a lease table.
   - **Throughput:** 6.5 → about 20 postings/min after the concurrency change.
   - Also cover how AI tools were used: Claude for build and research, Gemini in the product.
7. **The application note.** This is the second half of interview step 1. Write it addressed to Everstage, at about one page, in plain language. Suggested shape:
   - The alpha: job posts are public, self-reported buying signals. Companies describe their comp, CPQ and planning pain in their own words when they hire for it.
   - What was built and that it runs live (link). Real numbers from the pipeline: boards, postings, candidates, relevant signals, precision you measured, drafts.
   - How it maps to their own examples: Buying-interest alerts, BDR Brief and the "Funeral of the Spreadsheet" campaign. The first play was originally called "spreadsheet-funeral" and was renamed to keep the app generic.
   - How impact gets judged: the 20% holdout, kill rules per play, the outcome log and the Impact page. Say plainly that no outreach has been sent yet, so there are no results yet.
   - What he'd do in the first 30 days with real CRM data: customer flags, verified proof points, HubSpot writeback, a precision eval set.
   - AI usage, and one rejected AI output.

   Don't overclaim. Ask Devesh about his voice and anything personal (the DHL angle is relevant: he ran Gen AI adoption and Copilot rollouts there).
8. **Independent review.** Have someone (or a separate model session) review the live app and the note as (a) Abhishek GP, SVP Growth & Marketing, and (b) a GTM engineer. Fix the top issues and re-test.

### P2: nice to have

9. Delete the unused edge functions `ingest`, `extract`, `draft` and `health` (needs the user's OK).
10. Refresh the README with final numbers and a screenshot.
11. Optionally, a single-file build (`npm run build:single`) as an offline demo attachment.

---

## 9. Known gotchas

- **Free tier limits:** about 2s of CPU per request and 150s wall clock. Keep jobs small and paced (`BUDGET_MS = 110_000`).
- **Gemini free-tier quotas are per model.** `llm.ts` discovers models via `models.list` (seen: gemini-3.5-flash-lite, 3.1-flash-lite, 3.5/3.6/3.7/3.8-flash). It falls back on a 429. If every model returns 429, extract stops and retries on the next tick.
- **Greenhouse double-encodes HTML.** `htmlToText` decodes entities, strips tags, then decodes again.
- **Salesforce CPQ wording:** say "end-of-sale" (no new customers since 2025), never "end-of-life".
- **Snapshot fallback:** the app falls back to a snapshot when the API is unreachable. Use `?source=snapshot` to test that path.
- **Rep actions:** these are stored as optimistic local events (localStorage) and also posted to `/api/event`. HubSpot and Slack are previews only; nothing is sent externally.
- **CRM status:** `accounts.crm_status` is `prospect` for everyone (no customer data), so the Customers view and the expand-account play stay empty until a CRM is connected. That's intentional.
