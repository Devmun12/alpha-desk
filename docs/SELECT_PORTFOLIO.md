# Select portfolio

Some of the things I have built and shipped. Each one is live, opens without a login, and takes about two minutes to try.

Short link to this page: https://bit.ly/devesh_pf

## Alpha Desk

Live: https://devmun12.github.io/alpha-desk/ · Code: https://github.com/Devmun12/alpha-desk

Turns public job postings into a short daily list of accounts for a revenue team, with the evidence and a draft email for each.

- Reads real job postings and keeps only the ones that signal a buying moment. Rules discard about 97% before a model runs.
- A daily brief ranks five accounts and says why. Rules build the shortlist, a model orders it, and code rejects any reason that states something untrue.
- Every draft goes through a review panel of three simulated buyers and an editor. The rewrite ships only if it passes the code checks and scores higher.
- Existing customers are routed to their account owner as an expansion conversation, never a cold email.
- 20% of accounts are held out as a control group, and every outreach angle has a retirement rule.

Built with React, Supabase (Postgres, scheduled jobs, edge functions) and Gemini.

## Settlement Review Kit

Live: https://devmun12.github.io/Razorpay_SettlementReviewKit/ · Code: https://github.com/Devmun12/Razorpay_SettlementReviewKit

A concept prototype for the Razorpay x ISB AI PM Build Challenge. When a merchant's settlement is held for review, she sees exactly what evidence is needed and prepares it on her phone.

- Reads a PDF on the device, finds the invoices in it, and checks order numbers and amounts exactly. A wrong file is rejected.
- The merchant confirms any ambiguous match, then submits one versioned evidence pack and gets a receipt that survives a refresh.
- A risk analyst's view shows each source, what was checked and what was not. The decision stays with the analyst.
- Nothing is uploaded. All reading happens in the browser, and all data is synthetic.

Built as a static page with pdf.js. Not a Razorpay product.

## Roster Exchange

Live: https://devmun12.github.io/DM_Hilabs/ · Code: https://github.com/Devmun12/DM_Hilabs

A concept prototype for a healthcare product case study. A provider group updates its roster once, and health plan staff review only the exceptions.

- The provider uploads a roster, checks the differences and confirms them.
- Low-risk contact updates apply automatically, and only at 90% confidence or more with every check passed. Everything else goes to a review queue.
- Each flagged change shows the AI suggestion and its evidence. The reviewer approves, edits or rejects, and can roll back an applied change.
- Every decision is written to an audit trail that exports to CSV, and the outcome numbers update as you act.

Built in plain JavaScript on a synthetic dataset of 150 clinicians and 48 roster changes, with a Playwright test of the main flow.

## Jedis Awards

Live: https://devmun12.github.io/JedisAwards/ · Code: https://github.com/Devmun12/JedisAwards

Live award voting for a class of 69. Phones vote, an admin runs each award, and a big screen reveals the winner.

- Three connected views: a phone voting app, an admin panel and a projector screen, kept in sync in real time.
- The admin controls the awards, the people and the results from one panel.
- Rehearsed with a load test of 80 simulated phones before the night.
- Libraries are bundled with the site, so nothing depends on a third-party CDN during the event.

Built as a static site on GitHub Pages with Supabase for the database and live updates.
