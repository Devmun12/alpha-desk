-- Agent layer: buyer review panel on drafts, the daily brief, and a seller profile so the
-- desk knows which accounts are already customers. Also makes the public demo read-only
-- for shared state: visitor actions are logged as events but no longer change play rows.

-- 1. Review trace for each draft (rounds, verdicts per simulated buyer, what was rewritten).
alter table public.plays add column if not exists review jsonb;

-- 2. Daily brief, one per day.
create table if not exists public.briefs (
  id bigint generated always as identity primary key,
  brief_date date not null unique,
  body jsonb not null,
  model text, input_tokens int default 0, output_tokens int default 0,
  created_at timestamptz not null default now()
);
alter table public.briefs enable row level security;
alter table public.runs drop constraint if exists runs_kind_check;
alter table public.runs add constraint runs_kind_check check (kind in ('ingest','extract','draft','notify','probe','analyze','brief'));

-- 3. Seller profile: who is running this desk. One row, set per deployment, never in code.
--    product_aliases: names of the seller's own product as they appear in job postings.
--    customer_names:  accounts known to be customers (until a CRM sync replaces this list).
--    Example:  insert into public.seller_profile (name, product_aliases, customer_names)
--              values ('Acme Comp', '{Acme Comp,AcmeComp}', '{Globex,Initech}');
create table if not exists public.seller_profile (
  id int primary key default 1 check (id = 1),
  name text not null,
  product_aliases text[] not null default '{}',
  customer_names text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.seller_profile enable row level security;
alter table public.accounts add column if not exists crm_source text;

-- A posting that names the seller's own product is not a competitor signal: the company is
-- probably a customer. Those accounts, and the ones on the customer list, leave the cold
-- outbound queue and get the expansion play, with the reason recorded.
create or replace function public.apply_seller_profile() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with p as (select * from public.seller_profile where id = 1),
  hit as (
    select a.id,
      case when a.name = any (p.customer_names) then 'On the customer list'
           else 'A job posting names your product. Confirm in the CRM.' end as src
    from public.accounts a cross join p
    where a.name = any (p.customer_names)
       or exists (select 1 from public.signals s cross join lateral jsonb_array_elements(s.current_tools) t
                  where s.account_id = a.id and lower(t->>'name') in (select lower(x) from unnest(p.product_aliases) x))
  )
  update public.accounts a set crm_status = 'customer', crm_source = hit.src
  from hit where a.id = hit.id and (a.crm_status <> 'customer' or a.crm_source is distinct from hit.src);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.apply_seller_profile() from public, anon, authenticated;
grant execute on function public.apply_seller_profile() to service_role;

-- 4. Public events no longer change shared rows. Before this, one visitor approving,
--    dismissing or editing a draft changed it for every later visitor. The app already
--    applies a visitor's own actions on top of server data in their browser.
create or replace function public.log_event(p_type text, p_account bigint, p_play bigint default null, p_signal bigint default null,
                                            p_payload jsonb default '{}'::jsonb, p_actor text default 'demo')
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if p_type not in ('viewed','approved','edited','sent','dismissed','signal_up','signal_down','replied','meeting','opportunity') then
    raise exception 'unknown event type %', p_type;
  end if;
  if (select count(*) from public.events where created_at > now() - interval '1 hour') > 600 then
    raise exception 'rate limited';
  end if;
  insert into public.events (type, account_id, play_id, signal_id, payload, actor)
  values (p_type, p_account, p_play, p_signal, case when p_type = 'edited' then '{}'::jsonb else coalesce(p_payload, '{}'::jsonb) end, left(coalesce(p_actor, 'demo'), 60))
  returning id into v_id;
  return v_id;
end $$;

-- 5. Desk document: the existing builder plus the agent layer's fields.
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'get_desk_base' and pronamespace = 'public'::regnamespace) then
    alter function public.get_desk() rename to get_desk_base;
  end if;
end $$;
create or replace function public.get_desk() returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.get_desk_base() || jsonb_build_object(
    'seller', (select jsonb_build_object('name', name, 'productAliases', product_aliases) from public.seller_profile where id = 1),
    'crmSource', coalesce((select jsonb_object_agg(id::text, crm_source) from public.accounts where crm_source is not null), '{}'::jsonb),
    'reviews', coalesce((select jsonb_object_agg(id::text, review) from public.plays where review is not null), '{}'::jsonb),
    'brief', (select body || jsonb_build_object('date', brief_date, 'createdAt', created_at) from public.briefs order by brief_date desc limit 1)
  );
$$;
revoke all on function public.get_desk_base() from public, anon, authenticated;
revoke all on function public.get_desk() from public, anon, authenticated;
grant execute on function public.get_desk_base() to service_role;
grant execute on function public.get_desk() to service_role;

-- 6. Schedules. Drafting is paced for a free model tier: a few accounts every ten minutes.
select cron.unschedule(jobname) from cron.job where jobname in ('ad-draft', 'ad-brief');
select cron.schedule('ad-draft', '*/10 * * * *', $$select ops.invoke('agent/draft', '{"limit": 3}'::jsonb)$$);
select cron.schedule('ad-brief', '30 12 * * *',  $$select ops.invoke('agent/brief', '{}'::jsonb)$$);
