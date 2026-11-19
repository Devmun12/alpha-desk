// draft job: for every scored account in the treatment group without a current draft,
// choose the play and write the first touch. Holdout accounts get a play record with
// status held_out and no copy, so the experiment can compare like with like.
import { finishRun, json, startRun } from "../db.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { DRAFT_VERSION, draftPlay } from "../draft.ts";
import { EXTRACT_VERSION } from "../extract.ts";
import { hasKey, LlmError } from "../llm.ts";
import { choosePlay, PLAY_BY_KEY } from "../plays.ts";

const BUDGET_MS = 110_000;
const MIN_GAP_MS = 6_000;

interface ScoreRow {
  account_id: number; name: string; category: string | null; crm_status: string; open_roles: number; sales_roles: number;
  intent_breakdown: Record<string, number>; score: number; tier: string; holdout: boolean;
}

export async function draft(db: SupabaseClient, body: { limit?: number; minScore?: number; accountIds?: number[] }): Promise<Response> {
  if (!hasKey()) return json({ skipped: "GEMINI_API_KEY not set" });

  await db.from("runs").update({ status: "error", error: "timed out", finished_at: new Date().toISOString() })
    .eq("kind", "draft").eq("status", "running").lt("started_at", new Date(Date.now() - 4 * 60e3).toISOString());
  const { count: running } = await db.from("runs").select("id", { count: "exact", head: true }).eq("kind", "draft").eq("status", "running");
  if ((running ?? 0) > 0 && !body.accountIds?.length) return json({ skipped: "draft already running" });

  // Draft only once the extraction backlog is clear, so each account is drafted on its full evidence.
  if (!body.accountIds?.length) {
    const { data: pending } = await db.rpc("extract_queue", { p_version: EXTRACT_VERSION, p_limit: 1 });
    if ((pending ?? []).length > 0) return json({ skipped: "waiting for extraction backlog" });
  }

  let q = db.from("v_account_scores").select("account_id,name,category,crm_status,open_roles,sales_roles,intent_breakdown,score,tier,holdout")
    .gte("score", body.minScore ?? 35).order("score", { ascending: false }).limit(200);
  if (body.accountIds?.length) q = q.in("account_id", body.accountIds);
  const { data: scored, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const { data: existing } = await db.from("plays").select("account_id").eq("prompt_version", DRAFT_VERSION);
  const done = new Set((existing ?? []).map((r) => r.account_id));
  const todo = ((scored ?? []) as ScoreRow[]).filter((s) => !done.has(s.account_id)).slice(0, Math.min(body.limit ?? 12, 25));
  if (todo.length === 0) return json({ queue: 0 });

  const runId = await startRun(db, "draft");
  const t0 = Date.now();
  const stats = { drafted: 0, heldOut: 0, checksFailed: 0, inputTokens: 0, outputTokens: 0, models: {} as Record<string, number>, errors: [] as string[] };
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

    if (a.holdout && a.crm_status !== "customer") {
      await db.from("plays").upsert({
        account_id: a.account_id, play_key: playKey, status: "held_out", holdout: true, evidence, prompt_version: DRAFT_VERSION,
      }, { onConflict: "account_id,play_key,prompt_version" });
      stats.heldOut++;
      continue;
    }

    const wait = last + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    try {
      const r = await draftPlay({
        company: a.name, category: a.category, crmStatus: a.crm_status, openRoles: a.open_roles, salesRoles: a.sales_roles, signals,
      }, play);
      const d = r.data;
      const { data: row, error: upErr } = await db.from("plays").upsert({
        account_id: a.account_id, play_key: playKey, status: "draft", holdout: false,
        persona: d.persona, angle: d.why_now, subject: d.subject, email: d.email, linkedin: d.linkedin, call_opener: d.call_opener,
        evidence, checks: r.checks, quote_used: d.quote_used || null,
        model: r.model, prompt_version: DRAFT_VERSION, input_tokens: r.inputTokens, output_tokens: r.outputTokens,
      }, { onConflict: "account_id,play_key,prompt_version" }).select("id").single();
      if (upErr) throw upErr;
      await db.from("events").insert({ account_id: a.account_id, play_id: row.id, type: "surfaced", payload: { score: a.score, tier: a.tier, play: playKey } });
      stats.drafted++;
      if (!r.checks.passed) stats.checksFailed++;
      stats.inputTokens += r.inputTokens;
      stats.outputTokens += r.outputTokens;
      stats.models[r.model] = (stats.models[r.model] ?? 0) + 1;
    } catch (e) {
      stats.errors.push(`${a.name}: ${(e as Error).message}`.slice(0, 300));
      if (e instanceof LlmError && e.status === 429) break;
    }
  }

  const status = stats.errors.length === 0 ? "ok" : stats.drafted > 0 ? "partial" : "error";
  await finishRun(db, runId, status, stats);
  return json({ runId, status, ...stats });
}
