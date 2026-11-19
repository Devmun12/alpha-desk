// api: the one edge function behind Alpha Desk.
// Public (the web app):
//   GET  /api/desk      one JSON document with everything the desk renders
//   GET  /api/health    pipeline and model status, no secrets
//   POST /api/event     record a rep action (approve, send, dismiss, feedback, outcome)
//   POST /api/analyze   read any job posting live with the same prompt and checks
// Internal (pg_cron via pg_net, x-pipeline-secret header):
//   POST /api/ingest | /api/extract      (drafting and the daily brief live in ../agent)
// Tables stay closed to anon; this function holds the service role.
import { admin, cors, isInternal, json, withLease } from "../_shared/db.ts";
import { extractPosting } from "../_shared/extract.ts";
import { draftPlay } from "../_shared/draft.ts";
import { hasKey, models } from "../_shared/llm.ts";
import { prefilter } from "../_shared/prefilter.ts";
import { choosePlay, PLAY_BY_KEY } from "../_shared/plays.ts";
import { ingest } from "../_shared/jobs/ingest.ts";
import { extract } from "../_shared/jobs/extract.ts";

const ANALYZE_PER_HOUR = 40;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);
  const route = url.pathname.replace(/^.*\/api/, "") || "/";
  const db = admin();

  try {
    if (["/ingest", "/extract"].includes(route)) {
      if (req.method !== "POST" || !(await isInternal(req, db))) return json({ error: "unauthorized" }, 401);
      const body = await req.json().catch(() => ({}));
      const job = route.slice(1);
      const run = () => (job === "ingest" ? ingest(db, body) : extract(db, body));
      // Targeted runs (explicit ids) skip the lease; scheduled runs are single-flight.
      if (body.accountIds?.length || body.postIds?.length) return await run();
      return await withLease(db, job, 170, run);
    }

    if (req.method === "GET" && route.startsWith("/desk")) {
      const { data, error } = await db.rpc("get_desk");
      if (error) throw error;
      const headers: Record<string, string> = { ...cors, "content-type": "application/json", "cache-control": "public, max-age=60" };
      if (url.searchParams.get("download")) headers["content-disposition"] = `attachment; filename="alpha-desk-snapshot.json"`;
      return new Response(JSON.stringify(data), { headers });
    }

    if (req.method === "GET" && route.startsWith("/health")) {
      let available: string[] = [];
      if (hasKey()) available = (await models().catch(() => [])).slice(0, 6);
      return json({ llm: { configured: hasKey(), models: available }, at: new Date().toISOString() });
    }

    if (req.method === "POST" && route.startsWith("/event")) {
      const b = await req.json();
      const { data, error } = await db.rpc("log_event", {
        p_type: String(b.type ?? ""), p_account: Number(b.accountId) || null, p_play: b.playId ? Number(b.playId) : null,
        p_signal: b.signalId ? Number(b.signalId) : null, p_payload: b.payload ?? {}, p_actor: String(b.actor ?? "demo"),
      });
      if (error) return json({ error: error.message }, 400);
      return json({ id: data });
    }

    if (req.method === "POST" && route.startsWith("/analyze")) {
      if (!hasKey()) return json({ error: "The AI model is not configured on this deployment." }, 503);
      const b = await req.json() as { title?: string; company?: string; text?: string; draft?: boolean };
      const title = (b.title ?? "").trim().slice(0, 200);
      const text = (b.text ?? "").trim().slice(0, 30_000);
      const company = (b.company ?? "").trim().slice(0, 120) || "Unknown company";
      if (!title || text.length < 200) return json({ error: "Paste a job title and at least a few paragraphs of the posting." }, 400);

      const since = new Date(Date.now() - 3600e3).toISOString();
      const { count } = await db.from("runs").select("id", { count: "exact", head: true }).eq("kind", "analyze").gte("started_at", since);
      if ((count ?? 0) >= ANALYZE_PER_HOUR) return json({ error: "Live reading is limited to 40 postings an hour on the free model tier. Try again later." }, 429);

      const { data: run } = await db.from("runs").insert({ kind: "analyze" }).select("id").single();
      const pf = prefilter(title, null, text, company);
      const x = await extractPosting({ company, title, text });
      let play = null;
      if (x.data.relevant && b.draft !== false) {
        const { data: w } = await db.from("signal_weights").select("signal_type, points");
        const pts = Object.fromEntries((w ?? []).map((r) => [r.signal_type, r.points]));
        const breakdown = Object.fromEntries(x.data.signal_types.map((t) => [t, pts[t] ?? 0]));
        const key = choosePlay("prospect", breakdown);
        const d = await draftPlay({
          company, category: null, crmStatus: "prospect", openRoles: 0, salesRoles: 0,
          signals: [{ title, postedAt: null, summary: x.data.summary, quotes: x.data.evidence.map((e) => e.quote), tools: x.data.current_tools.map((t) => t.name) }],
        }, PLAY_BY_KEY[key]);
        play = { playKey: key, ...d.data, checks: d.checks, model: d.model, inputTokens: d.inputTokens, outputTokens: d.outputTokens };
      }
      await db.from("runs").update({
        status: "ok", finished_at: new Date().toISOString(),
        stats: { relevant: x.data.relevant, model: x.model, inputTokens: x.inputTokens, outputTokens: x.outputTokens, prefilter: pf.tags },
      }).eq("id", run?.id ?? 0);
      return json({ prefilter: pf, extraction: x.data, model: x.model, latencyMs: x.latencyMs, inputTokens: x.inputTokens, outputTokens: x.outputTokens, play });
    }

    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: (e as Error).message.slice(0, 300) }, 500);
  }
});
