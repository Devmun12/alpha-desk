-- Candidates the AI has not read at the current prompt version. Prospects first, newest first.
create or replace function public.extract_queue(p_version text, p_limit int default 20)
returns table (id bigint, account_id bigint, company text, title text, department text, location text, content text)
language sql stable security definer set search_path = '' as $$
  select j.id, j.account_id, a.name, j.title, j.department, j.location, j.content
  from public.job_posts j
  join public.accounts a on a.id = j.account_id
  where j.is_candidate and j.closed_at is null and j.content is not null and length(j.content) > 200
    and not exists (select 1 from public.signals s where s.job_post_id = j.id and s.prompt_version = p_version)
  order by (a.crm_status = 'prospect') desc, j.posted_at desc nulls last
  limit p_limit;
$$;
revoke all on function public.extract_queue(text, int) from public, anon, authenticated;
grant execute on function public.extract_queue(text, int) to service_role;
