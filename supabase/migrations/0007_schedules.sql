-- One routed edge function (`api`) serves every job. Each job is single-flight inside
-- the function, so an overlapping tick exits immediately.
select cron.schedule('ad-ingest',  '* * * * *',   $$select ops.invoke('api/ingest',  '{"limit": 8}'::jsonb)$$);   -- refresh boards older than 20h
select cron.schedule('ad-extract', '* * * * *',   $$select ops.invoke('api/extract', '{"limit": 30}'::jsonb)$$);  -- drain the AI queue
select cron.schedule('ad-draft',   '*/2 * * * *', $$select ops.invoke('api/draft',   '{"limit": 12}'::jsonb)$$);  -- once the queue is empty
