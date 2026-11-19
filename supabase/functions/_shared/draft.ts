// Stage 3: write the first touch for one account and one play, check it in code, then put it
// in front of a panel of simulated sceptical buyers and revise until they would reply.
import { generateJson, type LlmResult } from "./llm.ts";
import type { Play } from "./plays.ts";

// v2: adds the buyer review panel and the revise loop (Nov 20). v1 was a single unreviewed draft.
export const DRAFT_VERSION = "draft.v2";

export interface DraftInput {
  company: string;
  category: string | null;
  crmStatus: string;
  openRoles: number;
  salesRoles: number;
  signals: {
    title: string;
    postedAt: string | null;
    summary: string;
    quotes: string[];
    tools: string[];
  }[];
}

export interface Draft {
  persona: string;
  why_now: string;
  subject: string;
  email: string;
  linkedin: string;
  call_opener: string;
  quote_used: string;
}

export interface DraftChecks {
  passed: boolean;
  issues: string[];
  words: number;
}

const SYSTEM = `You write first-touch outreach for a revenue team that sells incentive-compensation (sales commission), CPQ and sales-planning software to B2B companies. The seller's company is written as {{sender_company}}.

Voice: plain, specific, warm, a little playful. Write like a sharp colleague who noticed something useful, not a vendor.

Hard rules:
1. Open with the specific job posting by its title. The hiring is public; mention it naturally, never creepily.
2. Use at most ONE short phrase from the posting, copied exactly, in double quotes, at most 12 words. Put that exact phrase in quote_used (empty string if none).
3. Use only the approved claims provided. Do not invent customers, numbers, features, dates or results. Every number you write must come from the provided material.
4. Never name a person or a vendor other than {{sender_company}} and tools the posting itself names. Address the reader as {{first_name}} and sign off as {{sender_name}}.
5. Follow the play's guardrails exactly.
6. email: 60 to 110 words, no bullet points, one clear ask matching the play's call to action. No "I hope this finds you well", no "quick question", no "synergy", no exclamation marks.
7. subject: at most 6 words, lowercase except proper nouns, no clickbait.
8. linkedin: a connection note under 280 characters.
9. call_opener: what to say in the first 15 seconds of a cold call, under 45 words.
10. persona: the job title to contact, taken from the play's guidance and the posting (e.g. who the role reports to if stated).
11. why_now: one line, under 20 words, on why this week.`;

const schema = {
  type: "OBJECT",
  properties: {
    persona: { type: "STRING" },
    why_now: { type: "STRING" },
    subject: { type: "STRING" },
    email: { type: "STRING" },
    linkedin: { type: "STRING" },
    call_opener: { type: "STRING" },
    quote_used: { type: "STRING" },
  },
  required: ["persona", "why_now", "subject", "email", "linkedin", "call_opener", "quote_used"],
};

function buildUser(input: DraftInput, play: Play): string {
  const sig = input.signals.slice(0, 3).map((s, i) =>
    `Posting ${i + 1}: "${s.title}"${s.postedAt ? ` (posted ${s.postedAt.slice(0, 10)})` : ""}\n` +
    `What it reveals: ${s.summary}\n` +
    (s.tools.length ? `Tools named: ${s.tools.join(", ")}\n` : "") +
    `Verbatim lines:\n${s.quotes.map((q) => `- "${q}"`).join("\n")}`
  ).join("\n\n");
  return `Company: ${input.company}${input.category ? ` (${input.category})` : ""}
Relationship: ${input.crmStatus === "customer" ? "EXISTING customer: an expansion note from the account owner to the customer contact" : "Prospect, not a customer"}
Open roles on their job board: ${input.openRoles}, of which sales roles: ${input.salesRoles}

${sig}

PLAY: ${play.name}
Angle: ${play.angle}
Who to contact: ${play.who}
Call to action: ${play.cta}
Guardrails: ${play.guardrails.join(" ")}
Approved claims (use at most one):
${play.proof.map((p) => `- ${p.text}`).join("\n")}
${play.asset ? `Optional asset to offer: ${play.asset.label} (${play.asset.url})` : ""}`;
}

const BANNED = [/hope (this|you)/i, /quick question/i, /synerg/i, /!/, /\bjust (circling|following|checking)\b/i, /touch base/i];

export function checkDraft(d: Draft, input: DraftInput, play: Play): DraftChecks {
  const issues: string[] = [];
  const words = d.email.trim().split(/\s+/).length;
  if (words < 45 || words > 130) issues.push(`email is ${words} words (target 60-110)`);
  if (d.subject.split(/\s+/).length > 7) issues.push("subject longer than 6 words");
  if (d.linkedin.length > 300) issues.push("LinkedIn note over 280 characters");
  for (const re of BANNED) if (re.test(d.email)) issues.push(`banned phrase: ${re.source}`);
  const allowed = [play.proof.map((p) => p.text).join(" "), input.signals.map((s) => s.quotes.join(" ") + s.title + s.summary).join(" "), `${input.openRoles} ${input.salesRoles}`].join(" ");
  const nums = (d.email + " " + d.linkedin + " " + d.call_opener).match(/\d[\d,.%]*/g) ?? [];
  for (const n of nums) {
    const core = n.replace(/[,.%]+$/, "");
    if (core && !allowed.includes(core)) issues.push(`number not in approved material: ${n}`);
  }
  if (d.quote_used) {
    const all = input.signals.flatMap((s) => s.quotes).join(" ").toLowerCase().replace(/\s+/g, " ");
    if (!all.includes(d.quote_used.toLowerCase().replace(/\s+/g, " ").replace(/^"|"$/g, ""))) issues.push("quoted phrase is not verbatim from the posting");
    if (d.quote_used.split(/\s+/).length > 14) issues.push("quoted phrase longer than 12 words");
  }
  if (!/\{\{first_name\}\}/.test(d.email)) issues.push("missing {{first_name}} placeholder");
  return { passed: issues.length === 0, issues, words };
}

export async function draftPlay(input: DraftInput, play: Play, prefer: "quality" | "fast" = "quality"): Promise<LlmResult<Draft> & { checks: DraftChecks }> {
  const r = await generateJson<Draft>({ system: SYSTEM, user: buildUser(input, play), schema, temperature: 0.5, maxOutputTokens: 1500, prefer });
  return { ...r, checks: checkDraft(r.data, input, play) };
}

// ---- buyer review panel -------------------------------------------------------------
// A draft that passes the code checks can still be an email nobody answers. Before a rep
// sees it, three simulated buyers read it and score how likely they are to reply (1 to 5),
// each with their strongest objection. If any buyer scores it under 4, an editor rewrites
// it against the objections, the code checks run on the rewrite, and the panel reads the
// rewrite in a second round. The version that ships is the better-scoring of the two the
// panel has actually read: a rewrite nobody has read never ships, and a rewrite that
// scores no better than the first draft is thrown away.
// The panel runs on Flash-Lite and the writer prefers Flash, so where both are available
// the draft is not graded by the model that wrote it.

export const PANEL = [
  { key: "revops", buyer: "Head of Revenue Operations", lens: "Gets twenty vendor emails a day. Replies only when the sender clearly understands how the team works today and asks for something small." },
  { key: "controller", buyer: "Corporate Controller", lens: "Owns commission accruals and the audit trail. Distrusts sales language, vague benefits and any claim without proof." },
  { key: "hiring_manager", buyer: "Hiring manager for the posted role", lens: "Wrote the job posting. Protective of the team and the new hire; put off by any hint that the hire or the current process is a mistake, or that they are being watched." },
] as const;

export const PASS_SCORE = 4;

export interface PanelVerdict { buyer: string; score: number; would_reply: boolean; objection: string }
export interface ReviewRound {
  round: number;
  /** Which text the panel read: 0 is the first draft, 1 is the editor's rewrite. */
  version: 0 | 1;
  verdicts: PanelVerdict[];
  mean: number;
  /** The editor's one-line note on the rewrite proposed in this round, if any. */
  note: string;
  model: string;
}
export interface Review {
  rounds: ReviewRound[];
  /** Version that shipped, and why. */
  shipped: 0 | 1;
  decision: "passed_first_time" | "rewrite_scored_higher" | "rewrite_scored_no_better" | "rewrite_failed_checks" | "rewrite_fixed_checks" | "no_rewrite_offered" | "out_of_time";
  mean: number;
  firstMean: number;
  wouldReply: number;
  of: number;
  /** The text that did not ship, kept so a rep can compare. */
  other?: { version: 0 | 1; subject: string; email: string; mean: number | null };
}

const SCALE = `score is how likely this person is to reply, from 1 to 5:
1 = deletes it unread or marks it as spam. 2 = reads it and ignores it. 3 = reads it, might look the sender up, does not reply. 4 = would probably reply, or forward it to the right person. 5 = replies today.
Be honest. Most vendor email earns a 2. Politeness is not a reason to reply.
objection: their single strongest objection, one sentence, in their own voice. If they score 4 or 5, say what almost stopped them.`;

const BUYERS = `Buyers:\n${PANEL.map((p, i) => `${i + 1}. ${p.buyer}. ${p.lens}`).join("\n")}`;

const PANEL_SYSTEM = `You run a review panel for sales outreach. Three buyers each receive the email below. The message says whether the sender is a stranger or an existing supplier: judge it accordingly. Stay in character.

${BUYERS}

For each buyer, in the order above, return a score and an objection.
${SCALE}

Then act as the editor. Rewrite the subject and email so they answer the objections. The rewrite must obey every rule the writer had:
- Open with the specific job posting by its title.
- At most ONE phrase quoted from the posting, in double quotes, copied exactly from the verbatim lines provided, at most 12 words. Return it in quote_used (empty string if none).
- Only the approved claim provided. No new customers, numbers, features, dates, results, people or vendors.
- Do not change the relationship: if the sender is an existing supplier, say so; if a stranger, never imply otherwise.
- Keep {{first_name}}, {{sender_name}} and {{sender_company}} exactly as written.
- 60 to 110 words, no bullet points, no exclamation marks, one ask that matches the call to action.
- subject: at most 6 words, lowercase except proper nouns.
change_note: one sentence saying what you changed and for which buyer. If no change is needed, return the email unchanged and say so.`;

const READ_SYSTEM = `You run a review panel for sales outreach. Three buyers each receive the email below. The message says whether the sender is a stranger or an existing supplier: judge it accordingly. Stay in character.

${BUYERS}

For each buyer, in the order above, return a score and an objection.
${SCALE}`;

const verdictsSchema = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: { buyer: { type: "STRING" }, score: { type: "INTEGER" }, objection: { type: "STRING" } },
    required: ["buyer", "score", "objection"],
  },
};
const panelSchema = {
  type: "OBJECT",
  properties: { verdicts: verdictsSchema, revised_subject: { type: "STRING" }, revised_email: { type: "STRING" }, quote_used: { type: "STRING" }, change_note: { type: "STRING" } },
  required: ["verdicts", "revised_subject", "revised_email", "quote_used", "change_note"],
};
const readSchema = { type: "OBJECT", properties: { verdicts: verdictsSchema }, required: ["verdicts"] };

interface RawVerdict { buyer?: string; score?: number; objection?: string }
interface PanelOut { verdicts: RawVerdict[]; revised_subject?: string; revised_email?: string; quote_used?: string; change_note?: string }

/** Clamp and label what the model returned. The buyer names come from PANEL, not the model. */
export function readVerdicts(raw: RawVerdict[] | undefined): { verdicts: PanelVerdict[]; mean: number } {
  const verdicts = (raw ?? []).slice(0, PANEL.length).map((v, i) => {
    const score = Math.max(1, Math.min(5, Math.round(Number(v.score) || 1)));
    return { buyer: PANEL[i].buyer, score, would_reply: score >= PASS_SCORE, objection: String(v.objection ?? "").slice(0, 300) };
  });
  const mean = verdicts.length ? Math.round((verdicts.reduce((a, v) => a + v.score, 0) / verdicts.length) * 10) / 10 : 0;
  return { verdicts, mean };
}

/**
 * Which version ships. Pure, so the policy is tested without a model.
 * `rewrite.mean` is null when the panel has not read the rewrite.
 */
export function pickVersion(first: { passed: boolean; mean: number }, rewrite: { passed: boolean; mean: number | null } | null): { shipped: 0 | 1; decision: Review["decision"] } {
  if (!rewrite) return { shipped: 0, decision: "no_rewrite_offered" };
  if (!rewrite.passed) return { shipped: 0, decision: "rewrite_failed_checks" };          // e.g. an invented number
  if (!first.passed) return { shipped: 1, decision: "rewrite_fixed_checks" };              // a rule-breaking draft never beats a clean one
  if (rewrite.mean == null) return { shipped: 0, decision: "out_of_time" };               // unread rewrites never ship
  return rewrite.mean > first.mean ? { shipped: 1, decision: "rewrite_scored_higher" } : { shipped: 0, decision: "rewrite_scored_no_better" };
}

function panelUser(d: Draft, input: DraftInput, play: Play): string {
  const lines = input.signals.slice(0, 3).flatMap((s) => s.quotes).map((q) => `- "${q}"`).join("\n");
  return `Recipient company: ${input.company}
Relationship: ${input.crmStatus === "customer" ? "The sender is the account manager at a supplier this company already uses. Judge it as a note from an existing supplier, not as cold outreach." : "The sender is a vendor the buyer has never heard of. This is cold outreach."}
Job posting that prompted the email: "${input.signals[0]?.title ?? ""}"
Verbatim lines from the posting (the only text that may be quoted):
${lines}

Play: ${play.name}. Call to action: ${play.cta}
Guardrails: ${play.guardrails.join(" ")}
Approved claims (the only statements allowed about the sender):
${play.proof.map((p) => `- ${p.text}`).join("\n")}

--- EMAIL ---
Subject: ${d.subject}

${d.email}
--- END ---`;
}

/** Run the panel and the revise loop. `deadline` is an epoch ms after which no new round starts. */
export async function reviewDraft(first: Draft, input: DraftInput, play: Play, deadline: number):
  Promise<{ draft: Draft; checks: DraftChecks; review: Review; inputTokens: number; outputTokens: number }> {
  const firstChecks = checkDraft(first, input, play);
  const r1 = await generateJson<PanelOut>({ system: PANEL_SYSTEM, user: panelUser(first, input, play), schema: panelSchema, temperature: 0.4, maxOutputTokens: 1600, prefer: "fast", timeoutMs: 20_000 });
  let inputTokens = r1.inputTokens, outputTokens = r1.outputTokens;
  const v1 = readVerdicts(r1.data.verdicts);
  const note = String(r1.data.change_note ?? "").slice(0, 300);
  const rounds: ReviewRound[] = [{ round: 1, version: 0, ...v1, note, model: r1.model }];
  const done = (shipped: 0 | 1, decision: Review["decision"], rewrite: Draft | null, rewriteMean: number | null) => {
    const draft = shipped === 1 && rewrite ? rewrite : first;
    const mean = shipped === 1 ? (rewriteMean ?? 0) : v1.mean;
    const lastRead = shipped === 1 && rounds[1] ? rounds[1] : rounds[0];
    const other = rewrite ? (shipped === 1 ? { version: 0 as const, subject: first.subject, email: first.email, mean: v1.mean } : { version: 1 as const, subject: rewrite.subject, email: rewrite.email, mean: rewriteMean }) : undefined;
    const review: Review = { rounds, shipped, decision, mean, firstMean: v1.mean, wouldReply: lastRead.verdicts.filter((v) => v.would_reply).length, of: lastRead.verdicts.length, ...(other ? { other } : {}) };
    return { draft, checks: checkDraft(draft, input, play), review, inputTokens, outputTokens };
  };

  if (v1.verdicts.length > 0 && v1.verdicts.every((v) => v.would_reply) && firstChecks.passed) return done(0, "passed_first_time", null, null);
  const rewrite: Draft = { ...first, subject: String(r1.data.revised_subject ?? "").trim(), email: String(r1.data.revised_email ?? "").trim(), quote_used: String(r1.data.quote_used ?? "").trim() };
  if (!rewrite.email || (rewrite.email === first.email && rewrite.subject === first.subject)) return done(0, "no_rewrite_offered", null, null);
  const rewriteChecks = checkDraft(rewrite, input, play);
  let rewriteMean: number | null = null;
  if (rewriteChecks.passed && Date.now() < deadline) {
    const r2 = await generateJson<PanelOut>({ system: READ_SYSTEM, user: panelUser(rewrite, input, play), schema: readSchema, temperature: 0.4, maxOutputTokens: 700, prefer: "fast", timeoutMs: 20_000 });
    inputTokens += r2.inputTokens; outputTokens += r2.outputTokens;
    const v2 = readVerdicts(r2.data.verdicts);
    rewriteMean = v2.mean;
    rounds.push({ round: 2, version: 1, ...v2, note: "", model: r2.model });
  }
  const pick = pickVersion({ passed: firstChecks.passed, mean: v1.mean }, { passed: rewriteChecks.passed, mean: rewriteMean });
  return done(pick.shipped, pick.decision, rewrite, rewriteMean);
}
