-- Shared secret for internal function calls (pg_cron -> pg_net -> edge function).
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'pipeline_secret', 'x-pipeline-secret for internal edge functions')
where not exists (select 1 from vault.secrets where name = 'pipeline_secret');
-- Replace with your project URL when deploying elsewhere.
select vault.create_secret('https://bxtfkbifeirwebfytpax.supabase.co', 'project_url', 'Base URL for edge function calls')
where not exists (select 1 from vault.secrets where name = 'project_url');

create or replace function public.pipeline_secret_ok(s text) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'pipeline_secret' and decrypted_secret = s);
$$;
revoke all on function public.pipeline_secret_ok(text) from public, anon, authenticated;
grant execute on function public.pipeline_secret_ok(text) to service_role;

create schema if not exists ops;
create or replace function ops.invoke(fn text, body jsonb default '{}'::jsonb) returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/' || fn,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-pipeline-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pipeline_secret')),
    body := body,
    timeout_milliseconds := 150000);
$$;
revoke all on function ops.invoke(text, jsonb) from public, anon, authenticated;
