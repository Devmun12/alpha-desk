// extract job: works through candidate postings that have no signal for the current prompt
// version. Paced for free-tier rate limits; pg_cron calls it every minute until the
// queue is empty, so a new posting is read within minutes of being ingested.
import { finishRun, json, startRun } from "../db.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { EXTRACT_VERSION, extractPosting } from "../extract.ts";
import { hasKey, LlmError } from "../llm.ts";

const BUDGET_MS = 110_000;

export async function extract(db: SupabaseClient, body: { limit?: number; postIds?: number[]; concurrency?: number; gapMs?: number }): Promise<Response> {
  if (!hasKey()) return json({ skipped: "GEMINI_API_KEY not set" });
  const CONCURRENCY = Math.max(1, Math.min(body.concurrency ?? 3, 6));
  const MIN_GAP_MS = Math.max(1_000, body.gapMs ?? 4_500); // per worker

  // Mark runs that died mid-flight (CPU or wall-clock limit) so the run log stays honest.
  await db.from("runs").update({ status: "error", error: "timed out", finished_at: new Date().toISOString() })
    .eq("kind", "extract").eq("status", "running").lt("started_at", new Date(Date.now() - 5 * 60e3).toISOString());

  // Queue = open candidates without a signal at this prompt version. Prospects before customers.
  const { data: queue, error } = await db.rpc("extract_queue", { p_version: EXTRACT_VERSION, p_limit: Math.min(body.limit ?? 30, 60) });
  if (error) return json({ error: error.message }, 500);
  const items = (body.postIds?.length ? (queue ?? []).filter((q: { id: number }) => body.postIds!.includes(q.id)) : queue) ?? [];
  if (items.length === 0) return json({ queue: 0 });

  const runId = await startRun(db, "extract");
  const t0 = Date.now();
  const stats = { read: 0, relevant: 0, droppedQuotes: 0, inputTokens: 0, outputTokens: 0, models: {} as Record<string, number>, errors: [] as string[] };
  // Paced workers; free-tier quotas are per model and the client falls back across
  // Flash-Lite models on a 429, so this stays inside limits while draining the queue quickly.
  type Item = { id: number; account_id: number; company: string; title: string; department: string | null; location: string | null; content: string };
  const queueItems = [...(items as Item[])];
  let stop = false;
  await Promise.all(Array.from({ length: CONCURRENCY }, async (_, w) => {
    await new Promise((r) => setTimeout(r, w * 1500));
    while (!stop && queueItems.length && Date.now() - t0 < BUDGET_MS) {
      const p = queueItems.shift()!;
      const started = Date.now();
      try {
        const r = await extractPosting({ company: p.company, title: p.title, department: p.department, location: p.location, text: p.content });
        const x = r.data;
        const { error: insErr } = await db.from("signals").upsert({
          job_post_id: p.id, account_id: p.account_id, prompt_version: EXTRACT_VERSION, model: r.model,
          relevant: x.relevant, role_family: x.role_family, seniority: x.seniority, signal_types: x.signal_types,
          products: x.products, current_tools: x.current_tools, evidence: x.evidence, facts: x.facts ?? {},
          summary: x.summary, confidence: x.confidence, dropped_quotes: x.dropped_quotes,
          input_tokens: r.inputTokens, output_tokens: r.outputTokens, latency_ms: r.latencyMs,
        }, { onConflict: "job_post_id,prompt_version" });
        if (insErr) throw insErr;
        stats.read++;
        if (x.relevant) stats.relevant++;
        stats.droppedQuotes += x.dropped_quotes;
        stats.inputTokens += r.inputTokens;
        stats.outputTokens += r.outputTokens;
        stats.models[r.model] = (stats.models[r.model] ?? 0) + 1;
      } catch (e) {
        stats.errors.push(`${p.company} / ${p.title}: ${(e as Error).message}`.slice(0, 300));
        if (e instanceof LlmError && e.status === 429) stop = true; // every model is out of quota: retry next tick
      }
      const wait = MIN_GAP_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  }));

  const status = stats.errors.length === 0 ? "ok" : stats.read > 0 ? "partial" : "error";
  await finishRun(db, runId, status, stats);
  return json({ runId, status, ...stats });
}
