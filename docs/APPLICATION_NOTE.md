# Application note: Growth Engineer

To Abhishek GP and the Growth team at Everstage

**Live build:** https://bit.ly/AlphaDesk1  
**Code:** https://github.com/Devmun12/alpha-desk

## What I built

Alpha Desk reads the public job postings of target accounts and finds the ones where a company describes, in its own words, a commissions, quoting or sales-planning problem. Each morning it gives a rep five accounts to work first, the exact line from the posting that makes each one worth a call, and a first-touch draft.

One real row from this morning's list:

- **Account:** Fivetran, hiring a Sales Compensation Manager, Systems and Analytics.
- **Their words:** "Own the configuration, administration, and roadmap of our sales compensation platform (e.g., Xactly, CaptivateIQ, Varicent, or similar)".
- **What the rep gets:** a note that a commission tool is already in place, and a draft inviting the hiring manager to bring one plan they changed last quarter and watch it rebuilt.

That posting gives the stack, the pain and the timing. It is public and dated. Today a rep finds it by luck.

It is running on the job boards of 212 software companies. It read 17,798 open postings and found a verified signal at 111 of those companies. At 67 of them the posting names something specific: commissions run on spreadsheets, a named commission tool, a first compensation hire, or Salesforce CPQ.

## The decisions I made, and why

**1. Check every quote the model returns.** A rep will paste the quote into an email. Keyword rules first cut the postings to 583, a model reads those, and code then confirms that each line the model quotes appears word for word in the posting. Of 847 lines quoted, 41 failed and were dropped.

**2. Give the rep a short list for the day.** The account score alone put four in ten accounts in the top tier, which sorts nobody's morning. So rules build a shortlist, a model picks and orders five with a reason for each, and code rejects any reason that states a number or a draft status that is wrong.

**3. Treat a customer differently from a prospect.** Notion's posting for a compensation lead lists Everstage as a required tool. My first version read that as a competitor and queued a displacement email to your customer. Now the tool is told whose product it is selling. Those accounts go to the account owner as an expansion signal and are never cold-emailed.

**4. Decide in advance how each play gets switched off.** A play is one outreach angle, for example "commissions on spreadsheets" or "Salesforce CPQ is end-of-sale". There are seven, and each has a written rule for retiring it. One in five accounts is held back as a control group so reply rates can be compared.

**5. Have each draft criticised before a rep reads it.** Three simulated buyers say why they would ignore the email, and a rewrite is kept only when they score it higher. Of 12 rewrites, 3 were kept. I use this to give the rep a list of objections to fix. It does not predict replies.

## What is not proven

No email has been sent and no rep has used it, so I claim no results and no adoption. On 212 companies, about 30 get a new signal each week. That is too few to compare the outreach group with the control group in a reasonable time. It needs your real target list.

## First 30 days with your data

Connect the CRM so customers, owners and outcomes are real. Label 50 postings by hand and measure how often the model is right. Tighten the score so the top tier is small. Then put one play in front of two or three reps, send the first 100 emails, and compare replies with the control group.

## About me

I am a PGP student at ISB. Before that I ran IT programmes at DHL Express, including Gen AI adoption and Copilot rollouts. I want the role where I build the thing and then find out whether anyone used it.

Devesh
