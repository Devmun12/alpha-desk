// DEV-ONLY fixture with invented companies, used to render the UI before real data is pulled.
// Never shipped: the build uses public/snapshot.json exported from the live API.
const now = Date.now();
const iso = (d) => new Date(now - d * 86400e3).toISOString();
const posting = `About the role
Example Co is looking for a Sales Compensation Analyst to own our commission process end to end as we scale the go-to-market team.

What you'll do
• Calculate monthly commissions for 180 sellers, today managed in Google Sheets with a lot of manual reconciliation
• Partner with Finance on commission accruals and ASC 340-40 capitalization
• Support the design and rollout of FY27 compensation plans, including accelerators and SPIFFs
• Answer rep questions and resolve commission disputes quickly and transparently

What you'll bring
• 3+ years in sales compensation or revenue operations
• Advanced Excel; experience with Salesforce
• Bonus: experience implementing an ICM tool

The base salary range is $95,000 - $120,000 and this role is eligible for equity.`;
const accounts = [
  ["Example Co", "example.com", "Sales tech", "prospect", 86, "A", false, { spreadsheet_comp: 30, audit_controls: 10, comp_redesign: 14 }, "spreadsheet_comp", 34],
  ["Sample Labs", "sample.dev", "Data infra", "prospect", 71, "A", false, { cpq_legacy: 24, cpq_pain: 13 }, "cpq_legacy", 21],
  ["Demo Systems", "demo.io", "Security", "prospect", 58, "B", true, { icm_incumbent: 20, new_revops_leader: 20 }, "icm_incumbent", 12],
  ["Placeholder AI", "placeholder.ai", "AI", "customer", 52, "B", false, { planning_buildout: 14, scale_up: 8 }, "planning_buildout", 40],
].map(([name, domain, category, crmStatus, score, tier, holdout, breakdown, topSignal, salesRoles], i) => ({
  id: i + 1, name, domain, category, crmStatus, ats: "greenhouse", openRoles: 60 + i * 10, salesRoles, relevantPosts: 1,
  freshest: iso(2 + i * 3), products: ["incentives"], intent: Math.min(60, Object.values(breakdown).reduce((a, b) => a + b, 0)),
  fit: Math.min(25, Math.round(6 * Math.log(1 + salesRoles))), timing: 15, score, tier, breakdown, topSignal, holdout,
}));
const signals = accounts.map((a, i) => ({
  id: 100 + i, postId: 200 + i, accountId: a.id, title: ["Sales Compensation Analyst", "Deal Desk Manager", "Director, Revenue Operations", "Sales Strategy & Planning Lead"][i],
  department: "Finance", location: "Remote, US", url: "https://example.com/jobs/1", postedAt: a.freshest, roleFamily: ["commissions_admin", "deal_desk", "revops_leader", "sales_planning"][i],
  seniority: ["ic", "manager", "director", "manager"][i], types: Object.keys(a.breakdown), products: ["incentives"],
  tools: i === 0 ? [{ name: "Google Sheets", category: "spreadsheet", context: "in_use" }, { name: "Salesforce", category: "crm", context: "required_skill" }] : [],
  evidence: [
    { quote: "Calculate monthly commissions for 180 sellers, today managed in Google Sheets with a lot of manual reconciliation", supports: Object.keys(a.breakdown)[0] },
    { quote: "Partner with Finance on commission accruals and ASC 340-40 capitalization", supports: Object.keys(a.breakdown)[1] ?? Object.keys(a.breakdown)[0] },
  ], facts: {}, summary: `${a.name} is hiring someone to run commissions that are calculated in spreadsheets today, ahead of FY27 plan changes.`,
  confidence: 0.9 - i * 0.1, model: "gemini-3.5-flash-lite", promptVersion: "extract.v1", droppedQuotes: 0, content: posting,
}));
const plays = accounts.map((a, i) => ({
  id: 300 + i, accountId: a.id, playKey: ["retire-the-spreadsheet", "cpq-end-of-sale", "incumbent-swap", "expand-account"][i], status: a.holdout ? "held_out" : "draft",
  holdout: a.holdout, persona: "Head of Revenue Operations", whyNow: "They are hiring to run commissions by hand right before FY27 plans launch.",
  subject: "your new comp analyst", email: "Hi {{first_name}},\n\nSaw Example Co is hiring a Sales Compensation Analyst to calculate commissions \"today managed in Google Sheets\". Plans set up once, calculated from CRM data, with statements reps can check themselves.\n\nWorth 20 minutes before the new hire starts, to show what their first 90 days look like without the spreadsheet?\n\n{{sender_name}}",
  linkedin: "Saw you're hiring a Sales Comp Analyst. Happy to share how teams retire the commission spreadsheet before the new hire inherits it.",
  callOpener: "Hi, it's {{sender_name}} from {{sender_company}}. I saw the Sales Compensation Analyst role and the line about Google Sheets. Can I take 30 seconds on why that caught my eye?",
  quoteUsed: "today managed in Google Sheets", checks: { passed: i !== 1, issues: i === 1 ? ["number not in approved material: 30"] : [], words: 74 },
  model: "gemini-3.8-flash", promptVersion: "draft.v1", createdAt: iso(0.1), updatedAt: iso(0.1), signalIds: [100 + i],
}));
const desk = {
  generatedAt: new Date(now).toISOString(),
  stats: { boards: 212, boardsFresh: 212, companies: 296, postings: 18000, salesRoles: 4100, candidates: 640, read: 610, relevant: 190, droppedQuotes: 41, keptQuotes: 520,
    extractTokensIn: 1400000, extractTokensOut: 260000, draftTokensIn: 120000, draftTokensOut: 40000, extractLatencyP50: 8200,
    firstIngest: iso(0.2), lastIngest: iso(0.01), lastExtract: iso(0.01), lastDraft: iso(0.02) },
  accounts, signals, plays,
  rejected: [{ id: 999, accountId: 1, title: "Revenue Accountant", summary: "General accounting role; no commission or quoting responsibilities.", company: "Example Co", url: null }],
  events: plays.map((p) => ({ id: 500 + p.id, accountId: p.accountId, playId: p.id, signalId: null, type: "surfaced", payload: {}, actor: "system", at: p.createdAt })),
  runs: [{ id: 1, kind: "ingest", status: "ok", startedAt: iso(0.02), finishedAt: iso(0.019), stats: { accounts: 8, postings: 1039, newCandidates: 19 }, error: null },
         { id: 2, kind: "extract", status: "ok", startedAt: iso(0.015), finishedAt: iso(0.014), stats: { read: 20, relevant: 7, droppedQuotes: 2 }, error: null }],
  coverage: [{ ats: "greenhouse", boards: 120, postings: 12000 }, { ats: "ashby", boards: 84, postings: 5500 }, { ats: "lever", boards: 8, postings: 500 }],
  weights: Object.entries({ spreadsheet_comp: 30, icm_greenfield: 24, icm_incumbent: 20, comp_redesign: 14, cpq_legacy: 24, cpq_pain: 14, planning_buildout: 14, new_revops_leader: 20, scale_up: 8, audit_controls: 10 }).map(([signal_type, points]) => ({ signal_type, points, label: signal_type, play_key: "", description: "" })),
  roleWeights: [],
};
process.stdout.write(JSON.stringify(desk));
