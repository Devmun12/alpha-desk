// ingest job: pull every open posting from each account's public job board, keep the
// metadata for all of them (sales-hiring velocity), keep the body only for postings
// the prefilter flags, and mark postings that disappeared as closed.
import { fetchBoard, sha1, type Ats } from "../ats.ts";
import { prefilter, titleScreen } from "../prefilter.ts";
import { finishRun, json, pool, startRun } from "../db.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

interface Body { accountIds?: number[]; limit?: number; staleHours?: number }

export async function ingest(db: SupabaseClient, body: Body): Promise<Response> {
  const limit = Math.min(body.limit ?? 8, 25);

  // Free-tier edge functions get ~2s of CPU per request, so ingestion runs as a
  // single-flight job in small batches that pg_cron repeats until every board is fresh.
  // Mark runs that died mid-flight (CPU or wall-clock limit) so the run log stays honest.
  await db.from("runs").update({ status: "error", error: "timed out", finished_at: new Date().toISOString() })
    .eq("kind", "ingest").eq("status", "running").lt("started_at", new Date(Date.now() - 5 * 60e3).toISOString());

  const staleHours = body.staleHours ?? 20;

  let q = db.from("accounts").select("id, name, ats, ats_slug").not("ats", "is", null);
  if (body.accountIds?.length) q = q.in("id", body.accountIds);
  else q = q.or(`board_checked_at.is.null,board_checked_at.lt.${new Date(Date.now() - staleHours * 3600e3).toISOString()}`);
  const { data: accounts, error } = await q.order("board_checked_at", { ascending: true, nullsFirst: true }).limit(limit);
  if (error) return json({ error: error.message }, 500);

  const runId = await startRun(db, "ingest");
  const runStart = new Date().toISOString();
  const stats = { accounts: 0, postings: 0, candidates: 0, newCandidates: 0, closed: 0, boardsMissing: 0, errors: [] as string[] };

  await pool(accounts ?? [], 2, async (a) => {
    try {
      const postings = await fetchBoard(a.ats as Ats, a.ats_slug as string, (t, d) => titleScreen(t, d).needsBody);
      if (!postings) {
        stats.boardsMissing++;
        await db.from("accounts").update({ board_checked_at: new Date().toISOString(), open_roles: 0, sales_roles: 0 }).eq("id", a.id);
        return;
      }
      let sales = 0;
      const rows = [];
      for (const p of postings) {
        const f = prefilter(p.title, p.department, p.text, a.name);
        if (f.salesRole) sales++;
        rows.push({
          account_id: a.id,
          ats: p.ats,
          external_id: p.externalId,
          title: p.title.slice(0, 300),
          department: p.department?.slice(0, 200) ?? null,
          location: p.location?.slice(0, 200) ?? null,
          url: p.url,
          posted_at: p.postedAt,
          content: f.candidate ? p.text.slice(0, 40_000) : null,
          content_hash: f.candidate ? await sha1(p.text) : null,
          prefilter: f.tags.concat(f.salesRole ? ["sales-role"] : []),
          is_candidate: f.candidate,
          last_seen: runStart,
          closed_at: null,
        });
      }
      const before = await db.from("job_posts").select("external_id").eq("account_id", a.id).eq("is_candidate", true);
      const known = new Set((before.data ?? []).map((r) => r.external_id));
      for (let i = 0; i < rows.length; i += 400) {
        const { error: upErr } = await db.from("job_posts").upsert(rows.slice(i, i + 400), { onConflict: "ats,external_id" });
        if (upErr) throw upErr;
      }
      const { count: closed } = await db.from("job_posts")
        .update({ closed_at: runStart }, { count: "exact" })
        .eq("account_id", a.id).is("closed_at", null).lt("last_seen", runStart);
      const cands = rows.filter((r) => r.is_candidate);
      stats.accounts++;
      stats.postings += rows.length;
      stats.candidates += cands.length;
      stats.newCandidates += cands.filter((r) => !known.has(r.external_id)).length;
      stats.closed += closed ?? 0;
      await db.from("accounts").update({
        board_checked_at: new Date().toISOString(), open_roles: rows.length, sales_roles: sales,
      }).eq("id", a.id);
    } catch (e) {
      stats.errors.push(`${a.name}: ${(e as Error).message}`.slice(0, 300));
    }
  });

  const status = stats.errors.length === 0 ? "ok" : stats.accounts > 0 ? "partial" : "error";
  await finishRun(db, runId, status, stats);
  return json({ runId, status, ...stats });
}
