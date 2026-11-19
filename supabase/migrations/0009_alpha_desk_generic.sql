-- Vendor-neutral demo: every company is a prospect until a CRM says otherwise.
update public.accounts set crm_status = 'prospect' where crm_status <> 'prospect';
update public.signal_weights set play_key = 'retire-the-spreadsheet' where play_key = 'spreadsheet-funeral';

-- One routed edge function (api) now serves every job.
select cron.unschedule(jobname) from cron.job where jobname in ('hw-ingest', 'hw-extract', 'hw-draft');
select cron.schedule('ad-ingest',  '* * * * *',   $$select ops.invoke('api/ingest',  '{"limit": 8}'::jsonb)$$);
select cron.schedule('ad-extract', '* * * * *',   $$select ops.invoke('api/extract', '{"limit": 30}'::jsonb)$$);
select cron.schedule('ad-draft',   '*/2 * * * *', $$select ops.invoke('api/draft',   '{"limit": 12}'::jsonb)$$);

-- Experiment salt renamed with the product; no plays existed yet, so no assignment changed for anyone contacted.
create or replace view public.v_account_scores with (security_invoker = true) as
with rel as (
  select v.*, coalesce(rw.multiplier, 0.4) as role_mult, coalesce(v.posted_at, v.first_seen) as seen_at
  from public.v_signals v left join public.role_weights rw on rw.role_family = v.role_family
  where v.relevant
),
per_type as (
  select r.account_id, t.signal_type, max(round(w.points * r.role_mult * greatest(r.confidence, 0.5)))::int as pts
  from rel r cross join lateral unnest(r.signal_types) as t(signal_type)
  join public.signal_weights w on w.signal_type = t.signal_type
  group by r.account_id, t.signal_type
),
intent as (
  select account_id, least(60, sum(pts))::int as intent,
         jsonb_object_agg(signal_type, pts) as intent_breakdown,
         (array_agg(signal_type order by pts desc))[1] as top_signal
  from per_type group by account_id
),
agg as (
  select rel.account_id, count(distinct rel.job_post_id) as relevant_posts, max(rel.seen_at) as freshest,
         array_agg(distinct p) filter (where p is not null) as products
  from rel left join lateral unnest(rel.products) as p on true
  group by rel.account_id
),
scored as (
  select a.id as account_id, a.name, a.domain, a.category, a.crm_status, a.ats, a.open_roles, a.sales_roles,
    ag.relevant_posts, ag.freshest, ag.products, i.intent, i.intent_breakdown, i.top_signal,
    least(25, round(6 * ln(1 + a.sales_roles)))::int as fit,
    case when ag.freshest > now() - interval '14 days' then 15
         when ag.freshest > now() - interval '30 days' then 10
         when ag.freshest > now() - interval '60 days' then 6 else 2 end as timing,
    (abs(hashtext('ad-exp-1:' || a.id::text)) % 5 = 0) as holdout
  from public.accounts a join intent i on i.account_id = a.id join agg ag on ag.account_id = a.id
)
select *, least(100, intent + fit + timing) as score,
  case when least(100, intent + fit + timing) >= 70 then 'A' when least(100, intent + fit + timing) >= 50 then 'B' else 'C' end as tier
from scored;
