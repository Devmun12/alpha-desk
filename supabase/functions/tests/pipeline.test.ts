// deno test supabase/functions/tests
import nodeAssert from "node:assert/strict";

const assert = (v: unknown, msg?: string) => nodeAssert.ok(v, msg);
const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepEqual(a, b);
import { prefilter, titleScreen } from "../_shared/prefilter.ts";
import { verify, verifyQuote, type Extraction } from "../_shared/extract.ts";
import { checkDraft } from "../_shared/draft.ts";
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
