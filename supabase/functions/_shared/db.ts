import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export function admin(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

export const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
}

/** Run async work over items with bounded concurrency. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function startRun(db: SupabaseClient, kind: string): Promise<number> {
  const { data, error } = await db.from("runs").insert({ kind }).select("id").single();
  if (error) throw error;
  return data.id as number;
}

export async function finishRun(db: SupabaseClient, id: number, status: "ok" | "partial" | "error", stats: unknown, err?: string) {
  await db.from("runs").update({ status, stats, error: err ?? null, finished_at: new Date().toISOString() }).eq("id", id);
}

/**
 * Internal functions (ingest / extract / draft) are invoked by pg_cron through pg_net.
 * The caller sends x-pipeline-secret; the value lives in Supabase Vault and is checked
 * by a SECURITY DEFINER function only the service role can execute.
 */
export async function isInternal(req: Request, db: SupabaseClient): Promise<boolean> {
  const secret = req.headers.get("x-pipeline-secret");
  if (!secret) return false;
  const { data, error } = await db.rpc("pipeline_secret_ok", { s: secret });
  return !error && data === true;
}

/**
 * Single-flight: run `fn` only if no other invocation holds the job's lease. The lease
 * expires on its own, so a crashed run cannot block the schedule for long.
 */
export async function withLease(db: SupabaseClient, job: string, seconds: number, fn: () => Promise<Response>): Promise<Response> {
  const { data: holder, error } = await db.rpc("acquire_lease", { p_job: job, p_seconds: seconds });
  if (error) return json({ error: error.message }, 500);
  if (!holder) return json({ skipped: `${job} already running` });
  try {
    return await fn();
  } finally {
    await db.rpc("release_lease", { p_job: job, p_holder: holder });
  }
}
