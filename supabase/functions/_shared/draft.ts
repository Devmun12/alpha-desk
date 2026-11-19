// Stage 3: write the first touch for one account and one play, then check it.
import { generateJson, type LlmResult } from "./llm.ts";
import type { Play } from "./plays.ts";

export const DRAFT_VERSION = "draft.v1";

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

export async function draftPlay(input: DraftInput, play: Play): Promise<LlmResult<Draft> & { checks: DraftChecks }> {
  const r = await generateJson<Draft>({ system: SYSTEM, user: buildUser(input, play), schema, temperature: 0.5, maxOutputTokens: 1500, prefer: "quality" });
  return { ...r, checks: checkDraft(r.data, input, play) };
}
