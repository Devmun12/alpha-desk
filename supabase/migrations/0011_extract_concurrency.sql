-- Extraction runs five paced workers per tick (single-flight via the lease in 0010).
select cron.unschedule('ad-extract');
select cron.schedule('ad-extract', '* * * * *', $$select ops.invoke('api/extract', '{"limit":40,"concurrency":5,"gapMs":3000}'::jsonb)$$);
