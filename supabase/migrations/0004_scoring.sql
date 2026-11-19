-- Scoring is deterministic SQL on top of model-extracted signals, so every point a
-- rep sees can be traced to a rule and a quote. Weights live in one table.

alter table public.signals add column if not exists dropped_quotes int not null default 0;
alter table public.runs drop constraint if exists runs_kind_check;
alter table public.runs add constraint runs_kind_check check (kind in ('ingest','extract','draft','notify','probe','analyze'));

create table if not exists public.signal_weights (
  signal_type text primary key,
  points int not null,
  label text not null,
  play_key text not null,
  description text not null
);

insert into public.signal_weights (signal_type, points, label, play_key, description) values
  ('spreadsheet_comp', 30, 'Comp runs on spreadsheets', 'retire-the-spreadsheet', 'Commissions or plans are calculated in Excel / Sheets or by hand'),
  ('icm_greenfield',   24, 'Building comp from scratch', 'retire-the-spreadsheet', 'First comp hire or formalising the process, no tool named'),
  ('icm_incumbent',    20, 'Runs a competing ICM tool', 'incumbent-swap', 'A named commission tool is in place: displacement and renewal timing'),
  ('comp_redesign',    14, 'Redesigning comp plans', 'retire-the-spreadsheet', 'New plans / FY27 plan changes on the roadmap'),
  ('cpq_legacy',       24, 'Salesforce CPQ in the stack', 'cpq-end-of-sale', 'Runs or administers Salesforce CPQ, which is end-of-sale'),
  ('cpq_pain',         14, 'Quoting and approvals load', 'deal-desk-load', 'Manual quoting, approvals, discount governance'),
  ('planning_buildout',14, 'Owns territory / quota / capacity', 'capacity-build', 'Territory design, quota setting or capacity models'),
  ('new_revops_leader',20, 'New RevOps leader', 'new-leader-90', 'Head / Director / VP of RevOps or Sales Comp being hired'),
  ('scale_up',          8, 'Sales team scaling', 'capacity-build', 'Explicit rapid growth, new segments or regions'),
  ('audit_controls',   10, 'Comp audit and controls', 'retire-the-spreadsheet', 'SOX, ASC 606 / 340-40 or audit over commissions')
on conflict (signal_type) do update set points = excluded.points, label = excluded.label, play_key = excluded.play_key, description = excluded.description;

create table if not exists public.role_weights (role_family text primary key, multiplier numeric not null, label text not null);
insert into public.role_weights values
  ('commissions_admin', 1.0, 'Commissions admin'), ('sales_comp_strategy', 1.0, 'Sales comp strategy'),
  ('revops_leader', 1.0, 'RevOps leader'), ('deal_desk', 0.9, 'Deal desk'), ('sales_planning', 0.9, 'Sales planning'),
  ('revops_ic', 0.8, 'RevOps analyst'), ('finance_accounting', 0.8, 'Finance / accounting'),
  ('gtm_systems', 0.6, 'GTM systems'), ('bizops', 0.5, 'BizOps'), ('other', 0.4, 'Other')
on conflict (role_family) do update set multiplier = excluded.multiplier, label = excluded.label;

-- Current signal per posting = latest prompt version, open postings only.
create or replace view public.v_signals as
select distinct on (s.job_post_id)
  s.id, s.job_post_id, s.account_id, s.prompt_version, s.model, s.relevant, s.role_family, s.seniority,
  s.signal_types, s.products, s.current_tools, s.evidence, s.facts, s.summary, s.confidence,
  s.dropped_quotes, s.created_at,
  j.title, j.department, j.location, j.url, j.posted_at, j.first_seen, j.ats
from public.signals s
join public.job_posts j on j.id = s.job_post_id
where j.closed_at is null
order by s.job_post_id, s.created_at desc;

-- Per-account score: intent (best evidence per signal type, role-weighted, cap 60)
-- + fit (sales hiring, cap 25) + timing (freshest relevant posting, cap 15).
create or replace view public.v_account_scores as
with rel as (
  select v.*, coalesce(rw.multiplier, 0.4) as role_mult,
         coalesce(v.posted_at, v.first_seen) as seen_at
  from public.v_signals v left join public.role_weights rw on rw.role_family = v.role_family
  where v.relevant
),
per_type as (
  select r.account_id, t.signal_type, max(round(w.points * r.role_mult * greatest(r.confidence, 0.5))) as pts
  from rel r cross join lateral unnest(r.signal_types) as t(signal_type)
  join public.signal_weights w on w.signal_type = t.signal_type
  group by r.account_id, t.signal_type
),
intent as (
  select account_id, least(60, sum(pts))::int as intent,
         jsonb_object_agg(signal_type, pts order by pts desc) as intent_breakdown,
         (array_agg(signal_type order by pts desc))[1] as top_signal
  from per_type group by account_id
),
agg as (
  select account_id, count(*) as relevant_posts, max(seen_at) as freshest,
         array_agg(distinct p) filter (where p is not null) as products
  from rel left join lateral unnest(rel.products) as p on true
  group by account_id
)
select a.id as account_id, a.name, a.domain, a.category, a.crm_status, a.ats, a.open_roles, a.sales_roles,
  ag.relevant_posts, ag.freshest, ag.products,
  i.intent, i.intent_breakdown, i.top_signal,
  least(25, round(6 * ln(1 + a.sales_roles)))::int as fit,
  case when ag.freshest > now() - interval '14 days' then 15
       when ag.freshest > now() - interval '30 days' then 10
       when ag.freshest > now() - interval '60 days' then 6 else 2 end as timing,
  least(100, i.intent + least(25, round(6 * ln(1 + a.sales_roles)))::int +
       case when ag.freshest > now() - interval '14 days' then 15
            when ag.freshest > now() - interval '30 days' then 10
            when ag.freshest > now() - interval '60 days' then 6 else 2 end) as score,
  -- 20% of accounts are a stable control group: scored, never actioned.
  (abs(hashtext('ad-exp-1:' || a.id::text)) % 5 = 0) as holdout
from public.accounts a
join intent i on i.account_id = a.id
join agg ag on ag.account_id = a.id;
