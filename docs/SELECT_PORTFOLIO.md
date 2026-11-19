# Select portfolio

Some of the things I have built and shipped. Each one is live, opens without a login, and takes about two minutes to try.

Short link to this page: https://bit.ly/devesh_pf

## Settlement Review Kit

Live: https://devmun12.github.io/Razorpay_SettlementReviewKit/ · Code: https://github.com/Devmun12/Razorpay_SettlementReviewKit

A concept prototype for the Razorpay x ISB AI PM Build Challenge. When a merchant's settlement is held for review, she sees exactly what evidence is needed and prepares it on her phone.

- Reads a PDF on the device, finds the invoices in it, and checks order numbers and amounts exactly. A wrong file is rejected.
- The merchant confirms any ambiguous match, then submits one versioned evidence pack and gets a receipt that survives a refresh.
- A risk analyst's view shows each source, what was checked and what was not. The decision stays with the analyst.
- Nothing is uploaded. All reading happens in the browser, and all data is synthetic.

Built as a static page with pdf.js. Not a Razorpay product.

## Jedis Awards

Live: https://devmun12.github.io/JedisAwards/ (can login with 67534 student) · Code: https://github.com/Devmun12/JedisAwards

Live award voting for section awards. Phones vote, an admin runs each award, and a big screen reveals the winner. Developed with contingencies in mind for an awards night)

- Three connected views: a phone voting app, an admin panel and a projector screen, kept in sync in real time.
- The admin controls the awards, the people and the results from one panel. (Link - https://devmun12.github.io/JedisAwards/admin.html, password - jed1s_@@g__ha1)
- Rehearsed with a load test of 80 simulated phones before the night.
- Libraries are bundled with the site, so nothing depends on a third-party CDN during the event.

Built as a static site on GitHub Pages with Supabase for the database and live updates.

## Roster Exchange

Live: https://devmun12.github.io/DM_Hilabs/ · Code: https://github.com/Devmun12/DM_Hilabs

A concept prototype for a healthcare product case study. A provider group updates its roster once, and health plan staff review only the exceptions.

- The provider uploads a roster, checks the differences and confirms them.
- Low-risk contact updates apply automatically, and only at 90% confidence or more with every check passed. Everything else goes to a review queue.
- Each flagged change shows the AI suggestion and its evidence. The reviewer approves, edits or rejects, and can roll back an applied change.
- Every decision is written to an audit trail that exports to CSV, and the outcome numbers update as you act.

Built in plain JavaScript on a synthetic dataset of 150 clinicians and 48 roster changes, with a Playwright test of the main flow.

## Baari (DB and AI activities paused)

Live: https://baari-site.vercel.app · Code: https://github.com/Devmun12/baari-site

A product concept for families who share the care of an ageing parent from different cities, with a landing page and one AI feature. Baari means "turn" in Hindi. The database and AI calls are paused, so the page loads but the demo will not generate a plan.

- Forward a message, a Hindi or English voice note or a bill photo, and it becomes a task with a date and an owner. Slipped tasks pass to the next sibling.
- "Set up the week" takes a parent's week and returns a 7-day care plan split fairly between two family members.
- It never gives medical advice. A health question becomes an "Ask the doctor" task for the parent's own doctor.
- The server checks every form answer and the model's plan, and limits each visitor to three plans. The free-text note is never stored.
- Live tests caught the model inventing tasks and assigning the wrong owner, and both are documented.

Built as a single static page on Vercel, with serverless functions, Gemini for the plan and Supabase for storage.
