// agent: the jobs where a model makes a judgement call and code checks it.
//   POST /agent/draft     write the first touch, run the buyer review panel, revise   (internal)
//   POST /agent/brief     build the rep's daily brief                                 (internal)
//   POST /agent/compose   the same draft-and-review loop for one pasted posting       (public, rate limited)
// Internal routes are called by pg_cron via pg_net with the x-pipeline-secret header.
// Kept apart from `api` so a slow model call can never take the public read path or the
// ingest jobs down with it.
import { admin, cors, isInternal, json, withLease } from "../_shared/db.ts";
import { draftPlay, reviewDraft, type Review } from "../_shared/draft.ts";
import { hasKey } from "../_shared/llm.ts";
import { choosePlay, PLAY_BY_KEY } from "../_shared/plays.ts";
import { draft } from "../_shared/jobs/draft.ts";
import { brief } from "../_shared/jobs/brief.ts";

const LIVE_PER_HOUR = 40;
const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const list = (v: unknown, n: number) => (Array.isArray(v) ? v : []).map(String).slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const route = new URL(req.url).pathname.replace(/^.*\/agent/, "") || "/";
  const db = admin();
  try {
    if (req.method === "POST" && route === "/compose") {
      if (!hasKey()) return json({ error: "The AI model is not configured on this deployment." }, 503);
      const b = await req.json().catch(() => ({}));
      const title = String(b.title ?? "").trim().slice(0, 200);
      const company = String(b.company ?? "").trim().slice(0, 120) || "Unknown company";
      // The caller is a browser, so nothing it sends is trusted: a quote is kept only if it
      // appears in the posting text sent with it, the same rule the pipeline applies.
      const hay = flat(String(b.text ?? "").slice(0, 30_000));
      const quotes = list(b.quotes, 6).filter((q) => q.length < 400 && flat(q).split(" ").length >= 4 && hay.includes(flat(q))).slice(0, 4);
      const types = list(b.signalTypes, 10);
      if (!title || quotes.length === 0 || types.length === 0) return json({ error: "There is no verified line to draft from." }, 400);

      const since = new Date(Date.now() - 3600e3).toISOString();
      const { count } = await db.from("runs").select("id", { count: "exact", head: true }).eq("kind", "analyze").gte("started_at", since);
      if ((count ?? 0) >= LIVE_PER_HOUR) return json({ error: "Live reading is limited to 40 postings an hour on the free model tier. Try again later." }, 429);

      const { data: w } = await db.from("signal_weights").select("signal_type, points");
      const pts = Object.fromEntries((w ?? []).map((r) => [r.signal_type, r.points]));
      const playKey = choosePlay("prospect", Object.fromEntries(types.filter((t) => t in pts).map((t) => [t, pts[t]])));
      const play = PLAY_BY_KEY[playKey];
      const input = { company, category: null, crmStatus: "prospect", openRoles: 0, salesRoles: 0, signals: [{ title, postedAt: null, summary: String(b.summary ?? "").slice(0, 300), quotes, tools: list(b.tools, 10) }] };
      const d = await draftPlay(input, play, "fast");
      let out = d.data, checks = d.checks, review: Review | null = null;
      try {
        const rv = await reviewDraft(d.data, input, play, Date.now() + 40_000);
        out = rv.draft; checks = rv.checks; review = rv.review;
      } catch { /* the checked draft is still returned, unreviewed */ }
      return json({ playKey, ...out, checks, review, model: d.model });
    }

    if (req.method !== "POST" || !(await isInternal(req, db))) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    if (route === "/draft") return body.accountIds?.length ? await draft(db, body) : await withLease(db, "draft", 150, () => draft(db, body));
    if (route === "/brief") return await withLease(db, "brief", 60, () => brief(db, body));
    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: (e as Error).message.slice(0, 300) }, 500);
  }
});
