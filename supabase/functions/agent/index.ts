// agent: the two jobs where a model makes a judgement call and code checks it.
//   POST /agent/draft   write the first touch, run the buyer review panel, revise
//   POST /agent/brief   build the rep's daily brief
// Internal only (pg_cron via pg_net, x-pipeline-secret header). Kept apart from `api` so a
// slow model call can never take the public read path or the ingest jobs down with it.
import { admin, cors, isInternal, json, withLease } from "../_shared/db.ts";
import { draft } from "../_shared/jobs/draft.ts";
import { brief } from "../_shared/jobs/brief.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const route = new URL(req.url).pathname.replace(/^.*\/agent/, "") || "/";
  const db = admin();
  try {
    if (req.method !== "POST" || !(await isInternal(req, db))) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    if (route === "/draft") return body.accountIds?.length ? await draft(db, body) : await withLease(db, "draft", 150, () => draft(db, body));
    if (route === "/brief") return await withLease(db, "brief", 60, () => brief(db, body));
    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: (e as Error).message.slice(0, 300) }, 500);
  }
});
