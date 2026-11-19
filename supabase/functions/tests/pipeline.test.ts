// deno test supabase/functions/tests
import nodeAssert from "node:assert/strict";

const assert = (v: unknown, msg?: string) => nodeAssert.ok(v, msg);
const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepEqual(a, b);
import { prefilter, titleScreen } from "../_shared/prefilter.ts";
import { verify, verifyQuote, type Extraction } from "../_shared/extract.ts";
import { checkDraft, pickVersion, readVerdicts } from "../_shared/draft.ts";
import { acceptModelBrief, priority, type Candidate } from "../_shared/jobs/brief.ts";
import { modelOrder } from "../_shared/llm.ts";
import { choosePlay, PLAY_BY_KEY } from "../_shared/plays.ts";

Deno.test("screen ignores pay-transparency boilerplate on sales roles", () => {
  const r = prefilter("AI Security Sales Executive, Bay Area", "Sales", "OTE includes base and commission. Eligible for variable pay and accelerators.");
  assertEquals(r.candidate, false);
  assertEquals(r.salesRole, true);
});

Deno.test("screen never sends a quota-carrying territory role to the model", () => {
  assertEquals(titleScreen("Territory Account Executive, Northeast", "Sales").titleTags, []);
  assertEquals(prefilter("Territory Executive (US)", "Sales", "Own your territory and quota.").candidate, false);
});

Deno.test("screen keeps comp, revops and deal-desk roles", () => {
  assert(prefilter("Sales Compensation Analyst", "Finance", "Administer plans in CaptivateIQ.").candidate);
  assert(prefilter("Revenue Operations Manager", "Operations", "Manage commission statements in Google Sheets.").candidate);
  assert(prefilter("Deal Desk Manager", "Sales", "Approve discounts.").candidate);
});

Deno.test("finance titles count only with operational comp language", () => {
  assert(prefilter("Senior Revenue Accountant", "Finance", "You will calculate and accrue sales commissions under ASC 340-40.").candidate);
  assertEquals(prefilter("Senior Accountant", "Finance", "Month-end close and reconciliations.").candidate, false);
});

Deno.test("a vendor's own postings do not trigger on its own name", () => {
  assertEquals(prefilter("Solutions Consultant", "Sales", "Demo PandaDoc to prospects.", "PandaDoc").candidate, false);
});

const posting = "Calculate monthly commissions for 180 sellers, today managed in Google Sheets with a lot of manual reconciliation. Work with Comp to implement SA variable compensation.";

Deno.test("quotes must be verbatim (whitespace and punctuation tolerant, words not)", () => {
  assert(verifyQuote("calculate monthly commissions for 180 sellers,  today managed in Google Sheets", posting));
  assertEquals(verifyQuote("calculate monthly commissions for 200 sellers in Google Sheets", posting), null);
});

Deno.test("verifier drops quotes that do not support their label, and the signals they carried", () => {
  const x: Extraction = {
    relevant: true, role_family: "commissions_admin", seniority: "ic", signal_types: ["spreadsheet_comp", "scale_up"], products: ["incentives"],
    current_tools: [{ name: "CaptivateIQ", category: "icm", context: "in_use" }],
    evidence: [
      { quote: "Work with Comp to implement SA variable compensation", supports: "spreadsheet_comp" },
      { quote: "We are growing fast and hiring everywhere", supports: "scale_up" },
    ],
    facts: {}, summary: "x", confidence: 0.9,
  };
  const v = verify(x, posting);
  assertEquals(v.relevant, false);
  assertEquals(v.dropped_quotes, 2);
  assertEquals(v.current_tools, []); // CaptivateIQ is not in the posting
});

Deno.test("draft checks flag invented numbers and paraphrased quotes", () => {
  const input = { company: "Example Co", category: null, crmStatus: "prospect", openRoles: 0, salesRoles: 0,
    signals: [{ title: "Sales Compensation Analyst", postedAt: null, summary: "", quotes: ["today managed in Google Sheets"], tools: [] }] };
  const play = PLAY_BY_KEY["retire-the-spreadsheet"];
  const good = checkDraft({ persona: "", why_now: "", subject: "your new comp analyst", linkedin: "hi", call_opener: "hi", quote_used: "today managed in Google Sheets",
    email: "Hi {{first_name}}, saw Example Co is hiring a Sales Compensation Analyst to run commissions \"today managed in Google Sheets\". Commission plans are set up once and calculated automatically from CRM and billing data. Worth twenty minutes before the new hire starts, to see what their first quarter looks like without the spreadsheet? {{sender_name}}" }, input, play);
  assert(good.passed, good.issues.join("; "));
  const bad = checkDraft({ persona: "", why_now: "", subject: "x", linkedin: "x", call_opener: "x", quote_used: "managed entirely in Excel",
    email: "Hi {{first_name}}, teams like yours cut payout time by 73% in 6 weeks. Saw the role and the line about spreadsheets, worth a chat? We help companies like yours every day and it would be great to connect soon about this. {{sender_name}}" }, input, play);
  assert(!bad.passed);
  assert(bad.issues.some((i) => i.includes("73")));
  assert(bad.issues.some((i) => i.includes("verbatim")));
});

Deno.test("Salesforce CPQ or a named incumbent outranks a slightly stronger generic signal", () => {
  assertEquals(choosePlay("prospect", { spreadsheet_comp: 30, cpq_legacy: 24 }), "cpq-end-of-sale");
  assertEquals(choosePlay("prospect", { new_revops_leader: 20, icm_incumbent: 18 }), "incumbent-swap");
  assertEquals(choosePlay("prospect", { spreadsheet_comp: 30, planning_buildout: 14 }), "retire-the-spreadsheet");
  assertEquals(choosePlay("customer", { cpq_legacy: 24 }), "expand-account");
});

// ---- review panel, brief and model order ---------------------------------------------
Deno.test("panel: a rewrite ships only if it is clean and the panel scored it higher", () => {
  const first = { passed: true, mean: 2.3 };
  assertEquals(pickVersion(first, { passed: true, mean: 3.3 }), { shipped: 1, decision: "rewrite_scored_higher" });
  assertEquals(pickVersion(first, { passed: true, mean: 2.3 }), { shipped: 0, decision: "rewrite_scored_no_better" });
  assertEquals(pickVersion(first, { passed: false, mean: 4.7 }), { shipped: 0, decision: "rewrite_failed_checks" });
  assertEquals(pickVersion(first, { passed: true, mean: null }), { shipped: 0, decision: "out_of_time" });
  assertEquals(pickVersion({ passed: false, mean: 3 }, { passed: true, mean: null }), { shipped: 1, decision: "rewrite_fixed_checks" });
});

Deno.test("panel: scores are clamped and buyer names come from the panel, not the model", () => {
  const r = readVerdicts([{ buyer: "CEO of Everything", score: 9, objection: "a" }, { score: 0, objection: "b" }, { score: 4, objection: "c" }]);
  assertEquals(r.verdicts.map((v) => v.score), [5, 1, 4]);
  assertEquals(r.verdicts[0].buyer, "Head of Revenue Operations");
  assertEquals(r.verdicts.map((v) => v.would_reply), [true, false, true]);
  assertEquals(r.mean, 3.3);
});

const cand = (id: number, over: Partial<Candidate> = {}): Candidate => {
  const c = { accountId: id, name: `Co${id}`, score: 70, tier: "A", customer: false, action: "review_draft" as const, play: "Retire the spreadsheet", daysSincePost: 3, hardSignals: ["spreadsheet_comp"], panel: "scored 3.7 of 5 by the buyer panel", panelMean: 3.7, checksPassed: true, quote: "q", postTitle: "Comp Analyst", ...over };
  return { ...c, priority: priority(c) };
};

Deno.test("brief: customers and nearly-finished work outrank cold drafts", () => {
  assert(cand(1, { customer: true, action: "confirm_owner" }).priority > cand(2).priority);
  assert(cand(3, { action: "send_approved" }).priority > cand(2).priority);
  assert(cand(4, { checksPassed: false }).priority < cand(2).priority);
});

Deno.test("brief: the model cannot add accounts or numbers", () => {
  const cs = [cand(1), cand(2), cand(3), cand(4)];
  const r = acceptModelBrief(cs, { items: [{ account_id: 2, why: "Posted 3 days ago with a spreadsheet signal." }, { account_id: 99, why: "invented" }, { account_id: 1, why: "They have 500 reps." }, { account_id: 3, why: "Fresh." }, { account_id: 2, why: "repeat" }] }, 5);
  assert(r.ok);
  assertEquals(r.items.map((i) => i.c.accountId), [2, 1, 3]);
  assert(!r.items[1].why.includes("500"));
  assertEquals(acceptModelBrief(cs, { items: [{ account_id: 99, why: "x" }] }, 5).ok, false);
});

Deno.test("model order: quality tries Flash first and keeps Flash-Lite as a net", () => {
  const all = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
  assertEquals(modelOrder(all, "quality"), ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]);
  assertEquals(modelOrder(all, "fast")[0], "gemini-3.5-flash-lite");
});

Deno.test("a draft may repeat a number from the play's own ask", () => {
  const play = PLAY_BY_KEY["cpq-end-of-sale"];
  const input = { company: "Acme", category: null, crmStatus: "prospect", openRoles: 0, salesRoles: 0, signals: [{ title: "Deal Desk Manager", postedAt: null, summary: "Runs Salesforce CPQ.", quotes: ["administer Salesforce CPQ for the sales team"], tools: ["Salesforce CPQ"] }] };
  const email = "Hi {{first_name}}, I saw the Deal Desk Manager opening. " + "Since the team is scoping what comes after the current quoting tool, it seemed worth a short conversation before that work is fixed. ".repeat(2) + "Would 20 minutes next week help? {{sender_name}}";
  const d = { persona: "x", why_now: "x", subject: "your deal desk opening", email, linkedin: "x", call_opener: "x", quote_used: "" };
  assertEquals(checkDraft(d, input, play).issues, []);
  assert(checkDraft({ ...d, email: email.replace("20 minutes", "45 minutes") }, input, play).issues.some((i) => i.includes("45")));
});

Deno.test("brief: a reason that claims the wrong state falls back to the rule's reason", () => {
  const cs = [cand(1), cand(2), cand(3)];
  const r = acceptModelBrief(cs, { items: [{ account_id: 1, why: "This approved draft is ready to go." }, { account_id: 2, why: "Fresh posting." }, { account_id: 3, why: "Fresh too." }] }, 5);
  assert(r.ok && !r.items[0].why.includes("approved"));
});
