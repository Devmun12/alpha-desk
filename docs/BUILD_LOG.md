# Build log

What was built, in order, with what broke and what was thrown away. Times are UTC on 19 November 2026. Numbers come from the `runs` table and the edge-function logs.

## Timeline

| Time | What happened |
|---|---|
| 15:37 | Supabase project created. |
| 17:27 | 296 target companies seeded; 212 have a readable Greenhouse, Ashby or Lever board. |
| 17:33 | First board read. |
| 18:31 | Extraction redeployed with leases and five paced workers: about 6.5 postings a minute became about 20. |
| 18:49 | Extraction queue empty: 17,798 open postings, 583 kept by the rule screen, 375 read by the model, 289 judged relevant. |
| 18:49 to 19:02 | Drafting failed on every run (see "The draft job that never finished"). Schedule paused at 19:02. |
| 19:11 | Agent function deployed. First three drafts written and reviewed by 19:13. |
| 19:18 | Buyer panel reworked from yes/no to a 1 to 5 score (see "A panel that said no to everything"). |

## Things that broke

**CPU limit on the first ingest.** Sixteen boards in parallel, fetching every posting body, hit the free tier's "CPU time exceeded". Fix: screen on the title before fetching a body, fetch Greenhouse bodies per job, eight boards a tick with a pool of two.

**Pay-transparency boilerplate.** The first rule screen matched "eligible for commission" on nearly every sales posting. The body rules were narrowed to operational comp language and a vendor's own name is stripped from its own postings.

**Sales roles sent to the model for nothing.** Screen v1 sent 218 territory and account-executive postings to the model; none were relevant. Screen v2 never sends a quota-carrying role.

**Two extract runs at once.** Two cron ticks could start the same job in the same instant. Counting "running" rows races; an upsert on a lease row does not.

**The draft job that never finished.** The first three scheduled draft runs wrote nothing and never reported an error. The platform log showed why: each was killed at the 150-second wall-clock limit with about 100 ms of CPU used, so the function was waiting on the model, not working. The model client had no timeout, tried only the newest Flash models and kept no record of why an attempt failed. Fixes: a 25-second ceiling per attempt, Flash-Lite as a fallback behind Flash, a ten-minute cool-down for a model that just failed, and an error trail that is written to the run log. Drafting also moved to its own function so a slow model call cannot affect the public read path.

**The fallback that was never there.** The app falls back to a saved snapshot when the API is unreachable. The deploy workflow wrote that snapshot to `app/public/`, a folder that did not exist, so the step failed quietly and the live site had no snapshot. One `mkdir -p`.

**Anyone could edit the demo.** The public event endpoint updated play status and could overwrite draft text for every visitor. Events are still logged, but they no longer change shared rows; each visitor's actions are applied in their own browser.

## AI output that was rejected

**"Variable compensation" labelled as spreadsheet comp.** The extraction model tagged a quote about variable pay as proof that commissions run on spreadsheets. The quote was verbatim, so the quote check passed. That led to label guards: a quote tagged `spreadsheet_comp` must itself mention a spreadsheet or a manual process, or it is dropped. 41 of 847 quotes have been dropped by the verifier so far.

**A customer's own product read as a competitor.** The extraction prompt is vendor-neutral, so when a posting listed the seller's own product as a required skill, the model reported a competing commission tool in place and the desk queued a displacement play against an existing customer. The model was not wrong about the text; the system was missing a fact. Fix: a seller profile (product names and a customer list, set per deployment in the database). Accounts that match leave the outbound queue and the experiment and get the expansion play, with the reason shown.

**A panel that said no to everything.** The first buyer panel answered "would you reply?" with yes or no. Three sceptical buyers said no to every draft and to every rewrite, which is realistic for cold email and useless as a signal: there was no way to tell whether a rewrite was better. It also deleted a true sentence ("we already work together") from a note to a customer, because it had not been told the sender was an existing supplier. The panel now scores 1 to 5, is told the relationship, and a rewrite ships only if the same panel scores it higher than the first draft and it still passes the code checks. A rewrite the panel has not read never ships.

## Decisions

- **Rules before the model, code after it.** About 3% of postings reach the model. Everything it returns is checked: quotes verbatim, tools named in the text, numbers traced to approved material.
- **Scoring in SQL.** Every point is traceable to a weight a manager can edit without a deploy.
- **The model ranks, rules bound it.** The daily brief is ranked by the model from a rule-built shortlist. Code drops any account it cannot match and any reason containing a number that is not in the account's facts, and falls back to the rule order if the model fails.
- **A holdout from day one**, and an honest note on the Impact page that this list is too small for it to read out.

## Not done

- Measured extraction precision. The model's own "relevant" rate (77%) is not a precision figure. Next step is a hand-labelled set of 30 to 50 postings.
- Score calibration. 41% of scored accounts are in the top tier and several tie at 100, so the score does not yet sort a rep's day; the brief does that job for now.
- No outreach has been sent, so there are no results.

## How AI tools were used

Claude wrote and reviewed most of the code and did the debugging above with direct access to the database and logs. Gemini runs inside the product: Flash-Lite for extraction and the buyer panel, Flash (with Flash-Lite as fallback) for drafting.
