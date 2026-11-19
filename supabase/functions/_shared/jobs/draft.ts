// draft job: for scored accounts without a current draft, choose the play, write the first
// touch, check it in code, then run it past the buyer review panel (see draft.ts).
// Holdout accounts get a play record with status held_out and no copy, so the experiment
// can compare like with like. Customers are never held out and never get cold outreach:
// they get the expansion play, addressed to the account owner.
import { finishRun, json, startRun } from "../db.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { DRAFT_VERSION, draftPlay, reviewDraft, type Review } from "../draft.ts";
import { hasKey, LlmError } from "../llm.ts";
import { choosePlay, PLAY_BY_KEY } from "../plays.ts";

// An edge function is killed at 150s. A run stops taking new accounts at 85s, which leaves
// room for one slow draft plus two panel rounds before the limit.
const BUDGET_MS = 85_000;
const REVIEW_DEADLINE_MS = 115_000;
const MIN_GAP_MS = 2_500;

interface ScoreRow {
  account_id: number; name: string; category: string | null; crm_status: string; open_roles: number; sales_roles: number;
  intent_breakdown: Record<string, number>; score: number; tier: string; holdout: boolean;
}

export async function draft(db: SupabaseClient, body: { limit?: number; minScore?: number; accountIds?: number[]; review?: boolean; writer?: "quality" | "fast" }): Promise<Response> {
  if (!hasKey()) return json({ skipped: "GEMINI_API_KEY not set" });

  // Mark runs that died mid-flight so the run log stays honest.
  await db.from("runs").update({ status: "error", error: "timed out", finished_at: new Date().toISOString() })
    .eq("kind", "draft").eq("status", "running").lt("started_at", new Date(Date.now() - 4 * 60e3).toISOString());

  // Draft only once the extraction backlog is clear, so each account is drafted on its full evidence.
  if (!body.accountIds?.length) {
    const { data: latest } = await db.from("signals").select("prompt_version").order("created_at", { ascending: false }).limit(1);
    const version = latest?.[0]?.prompt_version;
    if (version) {
      const { data: pending } = await db.rpc("extract_queue", { p_version: version, p_limit: 1 });
      if ((pending ?? []).length > 0) return json({ skipped: "waiting for extraction backlog" });
    }
  }

  // Accounts that name the seller's own product, or are on its customer list, become customers first.
  await db.rpc("apply_seller_profile");

  let q = db.from("v_account_scores").select("account_id,name,category,crm_status,open_roles,sales_roles,intent_breakdown,score,tier,holdout")
    .gte("score", body.minScore ?? 35).order("score", { ascending: false }).order("account_id").limit(300);
  if (body.accountIds?.length) q = q.in("account_id", body.accountIds);
  const { data: scored, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const { data: existing } = await db.from("plays").select("account_id,status").eq("prompt_version", DRAFT_VERSION);
  // A targeted run (explicit ids) re-drafts those accounts in place.
  const done = new Set(body.accountIds?.length ? [] : (existing ?? []).map((r) => r.account_id));
  const open = ((scored ?? []) as ScoreRow[]).filter((s) => !done.has(s.account_id));
  const isControl = (a: ScoreRow) => a.holdout && a.crm_status !== "customer";
  const control = open.filter(isControl);
  // Customers first: an expansion signal is the cheapest revenue on the list.
  const treat = open.filter((a) => !isControl(a)).sort((a, b) => Number(b.crm_status === "customer") - Number(a.crm_status === "customer") || b.score - a.score);
  const todo = treat.slice(0, Math.min(body.limit ?? 4, 10));
  if (todo.length === 0 && control.length === 0) return json({ queue: 0 });

  const runId = await startRun(db, "draft");
  const t0 = Date.now();
  const stats = { drafted: 0, heldOut: 0, checksFailed: 0, reviewed: 0, revised: 0, panelPassed: 0, panelMean: 0, modelNotes: [] as string[], inputTokens: 0, outputTokens: 0, models: {} as Record<string, number>, errors: [] as string[], remaining: Math.max(0, treat.length - todo.length) };

  // Control accounts need no model call: record them all at once.
  if (control.length) {
    const { error: hErr } = await db.from("plays").upsert(control.map((a) => ({
      account_id: a.account_id, play_key: choosePlay(a.crm_status, a.intent_breakdown ?? {}), status: "held_out", holdout: true, prompt_version: DRAFT_VERSION,
    })), { onConflict: "account_id,play_key,prompt_version" });
    if (hErr) stats.errors.push(`control: ${hErr.message}`); else stats.heldOut = control.length;
  }

  let last = 0;
  for (const a of todo) {
    if (Date.now() - t0 > BUDGET_MS) break;
    const { data: sigs } = await db.from("v_signals").select("id,title,posted_at,first_seen,summary,evidence,current_tools,signal_types,confidence")
      .eq("account_id", a.account_id).eq("relevant", true).order("confidence", { ascending: false }).limit(4);
    const signals = (sigs ?? []).map((s) => ({
      title: s.title as string,
      postedAt: (s.posted_at ?? s.first_seen) as string | null,
      summary: s.summary as string,
      quotes: ((s.evidence ?? []) as { quote: string }[]).map((e) => e.quote),
      tools: ((s.current_tools ?? []) as { name: string }[]).map((t) => t.name),
    }));
    const playKey = choosePlay(a.crm_status, a.intent_breakdown ?? {});
    const play = PLAY_BY_KEY[playKey];
    const evidence = (sigs ?? []).map((s) => s.id);
    const input = { company: a.name, category: a.category, crmStatus: a.crm_status, openRoles: a.open_roles, salesRoles: a.sales_roles, signals };

    const wait = last + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    try {
      const r = await draftPlay(input, play, body.writer === "fast" ? "fast" : "quality");
      if (r.skipped.length && stats.modelNotes.length < 4) stats.modelNotes.push(r.skipped.join("; ").slice(0, 240));
      let d = r.data, checks = r.checks, review: Review | null = null;
      let inTok = r.inputTokens, outTok = r.outputTokens;
      if (body.review !== false) {
        try {
          const rv = await reviewDraft(r.data, input, play, t0 + REVIEW_DEADLINE_MS);
          d = rv.draft; checks = rv.checks; review = rv.review;
          inTok += rv.inputTokens; outTok += rv.outputTokens;
        } catch (e) {
          // The panel is an improvement step. If it fails, the checked draft still ships, unreviewed.
          stats.errors.push(`${a.name} (panel): ${(e as Error).message}`.slice(0, 300));
        }
      }
      const { data: row, error: upErr } = await db.from("plays").upsert({
        account_id: a.account_id, play_key: playKey, status: "draft", holdout: false,
        persona: d.persona, angle: d.why_now, subject: d.subject, email: d.email, linkedin: d.linkedin, call_opener: d.call_opener,
        evidence, checks, review, quote_used: d.quote_used || null,
        model: r.model, prompt_version: DRAFT_VERSION, input_tokens: inTok, output_tokens: outTok,
      }, { onConflict: "account_id,play_key,prompt_version" }).select("id").single();
      if (upErr) throw upErr;
      await db.from("events").insert({ account_id: a.account_id, play_id: row.id, type: "surfaced", payload: { score: a.score, tier: a.tier, play: playKey } });
      stats.drafted++;
      if (!checks.passed) stats.checksFailed++;
      if (review) {
        stats.reviewed++;
        if (review.shipped === 1) stats.revised++;
        if (review.of > 0 && review.wouldReply === review.of) stats.panelPassed++;
        stats.panelMean = Math.round(((stats.panelMean * (stats.reviewed - 1) + review.mean) / stats.reviewed) * 10) / 10;
      }
      stats.inputTokens += inTok;
      stats.outputTokens += outTok;
      stats.models[r.model] = (stats.models[r.model] ?? 0) + 1;
    } catch (e) {
      stats.errors.push(`${a.name}: ${(e as Error).message}`.slice(0, 400));
      if (e instanceof LlmError && e.status === 429) break; // every model is out of quota: stop, try next tick
    }
  }

  const status = stats.errors.length === 0 ? "ok" : stats.drafted > 0 ? "partial" : "error";
  await finishRun(db, runId, status, stats);
  return json({ runId, status, ...stats });
}
