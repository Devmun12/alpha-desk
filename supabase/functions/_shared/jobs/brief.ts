// brief job: the rep's day, sorted before they log in.
// Rules pick the candidates and a starting order; one model call re-ranks them and writes
// the one-line reason for each; code then checks the model's work. If the model is
// unavailable or fails the checks, the rule-based brief ships instead, so there is always
// a brief. Every quote on the brief comes from the database, never from the model.
import { finishRun, json, startRun } from "../db.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { generateJson, hasKey } from "../llm.ts";
import { PLAY_BY_KEY } from "../plays.ts";

const HARD = ["spreadsheet_comp", "icm_incumbent", "icm_greenfield", "cpq_legacy"];
export type BriefAction = "review_draft" | "send_approved" | "follow_up" | "confirm_owner";

export interface Candidate {
  accountId: number; name: string; score: number; tier: string; customer: boolean;
  action: BriefAction; play: string; daysSincePost: number | null; hardSignals: string[];
  panel: string | null; panelMean: number | null; checksPassed: boolean | null; quote: string | null; postTitle: string | null;
  priority: number;
}

const ACTION_LABEL: Record<BriefAction, string> = {
  review_draft: "Review and approve the draft",
  send_approved: "Send the approved draft",
  follow_up: "Follow up: sent, no reply logged",
  confirm_owner: "Customer: confirm the account owner, then open the expansion conversation",
};

/** Rule-based priority. Transparent on purpose: a rep can see why something is first. */
export function priority(c: Omit<Candidate, "priority">): number {
  let p = c.score;
  if (c.action === "send_approved") p += 30;      // one click from done
  if (c.action === "follow_up") p += 20;          // a touch already invested
  if (c.customer) p += 25;                        // expansion beats cold outreach
  if (c.daysSincePost != null && c.daysSincePost <= 7) p += 15;
  else if (c.daysSincePost != null && c.daysSincePost <= 14) p += 8;
  p += Math.min(c.hardSignals.length, 2) * 6;
  if (c.panelMean != null) p += Math.round((c.panelMean - 3) * 4); // a draft buyers would answer is worth opening first
  if (c.checksPassed === false) p -= 20;          // needs editing before it can go
  return p;
}

function ruleWhy(c: Candidate): string {
  const bits: string[] = [];
  if (c.customer) bits.push("existing customer hiring into this area");
  if (c.daysSincePost != null) bits.push(c.daysSincePost <= 1 ? "posted in the last day" : `posted ${c.daysSincePost} days ago`);
  if (c.hardSignals.length) bits.push(`names ${c.hardSignals.map((h) => h.replace(/_/g, " ")).join(" and ")}`);
  if (c.panel) bits.push(`review panel: ${c.panel}`);
  return bits.join("; ") || `score ${c.score}`;
}

/** The model may reorder and explain. It may not invent accounts or numbers. */
export function acceptModelBrief(cands: Candidate[], out: { headline?: string; items?: { account_id: number; why: string }[] }, max: number):
  { ok: boolean; items: { c: Candidate; why: string }[]; reason?: string } {
  const byId = new Map(cands.map((c) => [c.accountId, c]));
  const seen = new Set<number>();
  const items: { c: Candidate; why: string }[] = [];
  for (const it of out.items ?? []) {
    const c = byId.get(Number(it.account_id));
    if (!c || seen.has(c.accountId)) continue;         // unknown or repeated account: drop
    seen.add(c.accountId);
    const facts = `${c.score} ${c.daysSincePost ?? ""} ${c.panel ?? ""} ${c.postTitle ?? ""} ${c.quote ?? ""} ${c.name}`;
    const nums = String(it.why ?? "").match(/\d+/g) ?? [];
    const why = nums.every((n) => facts.includes(n)) && it.why?.trim() ? String(it.why).trim().slice(0, 220) : ruleWhy(c); // invented number: fall back to the rule's reason
    items.push({ c, why });
    if (items.length >= max) break;
  }
  if (items.length < Math.min(3, cands.length)) return { ok: false, items: [], reason: "model returned too few valid items" };
  return { ok: true, items };
}

const SYSTEM = `You are the planning assistant for a business development rep who sells incentive-compensation, CPQ and sales-planning software. You are given today's candidate accounts with facts. Choose the five the rep should work first and order them.
Judgement to apply:
- Work that is nearly finished beats new work: an approved draft waiting to be sent, then a sent email with no reply.
- An existing customer hiring into comp, quoting or planning is an expansion conversation and outranks cold outreach, but the action is to confirm the account owner first, never a cold email.
- A posting from the last week beats an old one. A hard signal (spreadsheets, a named commission tool, a first comp hire, Salesforce CPQ) beats a soft one (growth, planning language).
- The buyer panel scores each draft from 1 to 5. A low score means the draft needs editing first: rank it lower unless the signal is exceptional.
- Do not pick five accounts with the same play if strong alternatives exist: a rep's day should not be one template.
For each pick write why: one sentence, at most 28 words, plain language, using only the facts given. No numbers that are not in the facts. No hype.
headline: one sentence, at most 24 words, on what kind of day this is.`;

const schema = {
  type: "OBJECT",
  properties: {
    headline: { type: "STRING" },
    items: { type: "ARRAY", items: { type: "OBJECT", properties: { account_id: { type: "INTEGER" }, why: { type: "STRING" } }, required: ["account_id", "why"] } },
  },
  required: ["headline", "items"],
};

export async function brief(db: SupabaseClient, body: { max?: number; model?: boolean }): Promise<Response> {
  const max = Math.max(3, Math.min(body.max ?? 5, 8));
  const { data: plays } = await db.from("plays").select("id,account_id,play_key,status,checks,review,quote_used,created_at").neq("status", "held_out").neq("status", "dismissed").order("created_at", { ascending: false });
  const latest = new Map<number, NonNullable<typeof plays>[number]>();
  for (const p of plays ?? []) if (!latest.has(p.account_id)) latest.set(p.account_id, p);
  if (latest.size === 0) return json({ skipped: "no drafts yet" });

  const ids = [...latest.keys()];
  const [{ data: scores }, { data: sigs }, { data: replies }] = await Promise.all([
    db.from("v_account_scores").select("account_id,name,score,tier,crm_status,freshest,intent_breakdown").in("account_id", ids),
    db.from("v_signals").select("account_id,title,evidence,confidence").in("account_id", ids).eq("relevant", true).order("confidence", { ascending: false }),
    db.from("events").select("account_id,type").in("type", ["replied", "meeting", "opportunity"]).in("account_id", ids),
  ]);
  const replied = new Set((replies ?? []).map((r) => r.account_id));
  const topSig = new Map<number, { title: string; quote: string | null }>();
  for (const s of sigs ?? []) if (!topSig.has(s.account_id)) topSig.set(s.account_id, { title: s.title, quote: (s.evidence as { quote: string }[] | null)?.[0]?.quote ?? null });

  const cands: Candidate[] = [];
  for (const s of scores ?? []) {
    const p = latest.get(s.account_id)!;
    if (p.status === "sent" && replied.has(s.account_id)) continue; // already in conversation
    const customer = s.crm_status === "customer";
    const action: BriefAction = customer && p.status === "draft" ? "confirm_owner" : p.status === "approved" ? "send_approved" : p.status === "sent" ? "follow_up" : "review_draft";
    const rv = p.review as { mean?: number; firstMean?: number; shipped?: number; of?: number } | null;
    const base = {
      accountId: s.account_id, name: s.name, score: s.score, tier: s.tier, customer, action,
      play: PLAY_BY_KEY[p.play_key]?.name ?? p.play_key,
      daysSincePost: s.freshest ? Math.max(0, Math.round((Date.now() - new Date(s.freshest).getTime()) / 864e5)) : null,
      hardSignals: Object.keys(s.intent_breakdown ?? {}).filter((k) => HARD.includes(k)),
      panel: rv?.of ? `scored ${rv.mean} of 5 by the buyer panel${rv.shipped === 1 ? " after a rewrite" : ""}` : null,
      panelMean: rv?.of ? Number(rv.mean) : null,
      checksPassed: (p.checks as { passed?: boolean } | null)?.passed ?? null,
      quote: topSig.get(s.account_id)?.quote ?? null, postTitle: topSig.get(s.account_id)?.title ?? null,
    };
    cands.push({ ...base, priority: priority(base) });
  }
  cands.sort((a, b) => b.priority - a.priority);
  const shortlist = cands.slice(0, 14);

  const runId = await startRun(db, "brief");
  let items = shortlist.slice(0, max).map((c) => ({ c, why: ruleWhy(c) }));
  let headline = `${cands.length} accounts are ready to work; ${cands.filter((c) => c.customer).length} are existing customers.`;
  let source: "agent" | "rules" = "rules", model: string | null = null, note: string | null = null, inTok = 0, outTok = 0;
  if (hasKey() && body.model !== false) {
    try {
      const user = shortlist.map((c) => JSON.stringify({
        account_id: c.accountId, company: c.name, score: c.score, customer: c.customer, state: ACTION_LABEL[c.action], play: c.play,
        days_since_posting: c.daysSincePost, hard_signals: c.hardSignals, review_panel: c.panel, checks_passed: c.checksPassed, posting: c.postTitle,
      })).join("\n");
      const r = await generateJson<{ headline: string; items: { account_id: number; why: string }[] }>({ system: SYSTEM, user, schema, temperature: 0.2, maxOutputTokens: 900, prefer: "fast", timeoutMs: 20_000 });
      inTok = r.inputTokens; outTok = r.outputTokens;
      const acc = acceptModelBrief(shortlist, r.data, max);
      if (acc.ok) { items = acc.items; source = "agent"; model = r.model; if (r.data.headline?.trim() && !/\d/.test(r.data.headline.replace(String(cands.length), ""))) headline = r.data.headline.trim().slice(0, 200); }
      else note = acc.reason ?? null;
    } catch (e) { note = (e as Error).message.slice(0, 200); }
  }

  const doc = {
    headline, source, model, note,
    items: items.map(({ c, why }, i) => ({
      rank: i + 1, accountId: c.accountId, name: c.name, score: c.score, tier: c.tier, customer: c.customer, action: c.action, actionLabel: ACTION_LABEL[c.action],
      play: c.play, why, quote: c.quote, postTitle: c.postTitle, daysSincePost: c.daysSincePost, panel: c.panel, rulePosition: shortlist.findIndex((x) => x.accountId === c.accountId) + 1,
    })),
    counts: {
      ready: cands.filter((c) => c.action === "review_draft").length, toSend: cands.filter((c) => c.action === "send_approved").length,
      awaitingReply: cands.filter((c) => c.action === "follow_up").length, customers: cands.filter((c) => c.customer).length,
      freshThisWeek: cands.filter((c) => c.daysSincePost != null && c.daysSincePost <= 7).length, considered: cands.length,
    },
  };
  const { error } = await db.from("briefs").upsert({ brief_date: new Date().toISOString().slice(0, 10), body: doc, model, input_tokens: inTok, output_tokens: outTok, created_at: new Date().toISOString() }, { onConflict: "brief_date" });
  await finishRun(db, runId, error ? "error" : note ? "partial" : "ok", { items: doc.items.length, source, considered: cands.length, inputTokens: inTok, outputTokens: outTok, models: model ? { [model]: 1 } : {}, errors: note ? [note] : [] }, error?.message);
  return json({ runId, source, headline, items: doc.items.map((i) => `${i.rank}. ${i.name}: ${i.why}`) });
}
