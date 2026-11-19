-- Single-flight for scheduled jobs. Two cron ticks can start a job in the same instant;
-- counting 'running' rows races, an upsert on a lease row does not.
create table if not exists ops.job_leases (job text primary key, holder uuid not null, expires_at timestamptz not null);

create or replace function public.acquire_lease(p_job text, p_seconds int default 150) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_holder uuid := gen_random_uuid(); v_got uuid;
begin
  insert into ops.job_leases (job, holder, expires_at) values (p_job, v_holder, now() + make_interval(secs => p_seconds))
  on conflict (job) do update set holder = excluded.holder, expires_at = excluded.expires_at
    where ops.job_leases.expires_at < now()
  returning holder into v_got;
  return v_got; -- null when someone else holds a live lease
end $$;

create or replace function public.release_lease(p_job text, p_holder uuid) returns void
language sql security definer set search_path = '' as $$
  delete from ops.job_leases where job = p_job and holder = p_holder;
$$;
revoke all on function public.acquire_lease(text, int) from public, anon, authenticated;
revoke all on function public.release_lease(text, uuid) from public, anon, authenticated;
grant execute on function public.acquire_lease(text, int) to service_role;
grant execute on function public.release_lease(text, uuid) to service_role;
