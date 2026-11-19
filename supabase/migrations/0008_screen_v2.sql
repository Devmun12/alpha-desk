-- Screen v2, after the first 88 AI reads: 218 "territory / quota" candidates were
-- quota-carrying sellers and 0 of 15 read were relevant, while RevOps and deal-desk
-- titles were 85-95% relevant. Sellers never go to the model, "capacity planning" only
-- counts in a GTM title, and the queue reads the highest-yield families first.
create or replace function public.screen_ok(p_title text, p_tags text[]) returns boolean
language sql immutable set search_path = '' as $$
  select not ('sales-role' = any(p_tags))
     and p_title !~* '\m(territory (executive|manager|sales|account)|account executive|sales executive)\M'
     and not (p_tags[1] = 'title:planning' and p_title !~* '(sales|gtm|go-to-market|revenue|territor|quota|commercial|incentive)')
$$;

create or replace function public.screen_priority(p_tags text[]) returns int
language sql immutable set search_path = '' as $$
  select case p_tags[1]
    when 'title:comp' then 1 when 'title:dealdesk' then 2 when 'title:revops' then 3 when 'title:hrcomp' then 4
    when 'title:systems' then 5 when 'title:planning' then 6 when 'title:finance' then 7 when 'body-only' then 8 else 9 end
$$;

create or replace function public.extract_queue(p_version text, p_limit int default 20)
returns table (id bigint, account_id bigint, company text, title text, department text, location text, content text)
language sql stable security definer set search_path = '' as $$
  select j.id, j.account_id, a.name, j.title, j.department, j.location, j.content
  from public.job_posts j
  join public.accounts a on a.id = j.account_id
  where j.is_candidate and j.closed_at is null and j.content is not null and length(j.content) > 200
    and public.screen_ok(j.title, j.prefilter)
    and not exists (select 1 from public.signals s where s.job_post_id = j.id and s.prompt_version = p_version)
  order by public.screen_priority(j.prefilter), (a.crm_status = 'prospect') desc, j.posted_at desc nulls last
  limit p_limit;
$$;
revoke all on function public.extract_queue(text, int) from public, anon, authenticated;
grant execute on function public.extract_queue(text, int) to service_role;
