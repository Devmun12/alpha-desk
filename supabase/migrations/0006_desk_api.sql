-- Read API for the app: one JSON document with everything the desk renders.
-- Exposed only through the `snapshot` edge function (service role); anon has no table access.

alter table public.plays add column if not exists checks jsonb not null default '{}';
alter table public.plays add column if not exists quote_used text;

create or replace function public.get_desk() returns jsonb
language sql stable security definer set search_path = '' as $$
select jsonb_build_object(
  'generatedAt', now(),
  'stats', jsonb_build_object(
    'boards', (select count(*) from public.accounts where ats is not null),
    'boardsFresh', (select count(*) from public.accounts where ats is not null and board_checked_at > now() - interval '36 hours'),
    'companies', (select count(*) from public.accounts),
    'postings', (select count(*) from public.job_posts where closed_at is null),
    'salesRoles', (select coalesce(sum(sales_roles), 0) from public.accounts),
    'candidates', (select count(*) from public.job_posts where closed_at is null and is_candidate),
    'read', (select count(*) from public.v_signals),
    'relevant', (select count(*) from public.v_signals where relevant),
    'droppedQuotes', (select coalesce(sum(dropped_quotes), 0) from public.signals),
    'keptQuotes', (select coalesce(sum(jsonb_array_length(evidence)), 0) from public.signals),
    'extractTokensIn', (select coalesce(sum(input_tokens), 0) from public.signals),
    'extractTokensOut', (select coalesce(sum(output_tokens), 0) from public.signals),
    'draftTokensIn', (select coalesce(sum(input_tokens), 0) from public.plays),
    'draftTokensOut', (select coalesce(sum(output_tokens), 0) from public.plays),
    'extractLatencyP50', (select percentile_cont(0.5) within group (order by latency_ms) from public.signals),
    'firstIngest', (select min(started_at) from public.runs where kind = 'ingest' and status in ('ok','partial')),
    'lastIngest', (select max(finished_at) from public.runs where kind = 'ingest' and status in ('ok','partial')),
    'lastExtract', (select max(finished_at) from public.runs where kind = 'extract' and status in ('ok','partial')),
    'lastDraft', (select max(finished_at) from public.runs where kind = 'draft' and status in ('ok','partial'))
  ),
  'accounts', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.account_id, 'name', s.name, 'domain', s.domain, 'category', s.category, 'crmStatus', s.crm_status,
      'ats', s.ats, 'openRoles', s.open_roles, 'salesRoles', s.sales_roles, 'relevantPosts', s.relevant_posts,
      'freshest', s.freshest, 'products', s.products, 'intent', s.intent, 'fit', s.fit, 'timing', s.timing,
      'score', s.score, 'tier', s.tier, 'breakdown', s.intent_breakdown, 'topSignal', s.top_signal, 'holdout', s.holdout
    ) order by s.score desc) from public.v_account_scores s), '[]'::jsonb),
  'signals', coalesce((select jsonb_agg(jsonb_build_object(
      'id', v.id, 'postId', v.job_post_id, 'accountId', v.account_id, 'title', v.title, 'department', v.department,
      'location', v.location, 'url', v.url, 'postedAt', coalesce(v.posted_at, v.first_seen), 'roleFamily', v.role_family,
      'seniority', v.seniority, 'types', v.signal_types, 'products', v.products, 'tools', v.current_tools,
      'evidence', v.evidence, 'facts', v.facts, 'summary', v.summary, 'confidence', v.confidence, 'model', v.model,
      'promptVersion', v.prompt_version, 'droppedQuotes', v.dropped_quotes,
      'content', (select left(j.content, 16000) from public.job_posts j where j.id = v.job_post_id)
    ) order by v.confidence desc) from public.v_signals v where v.relevant), '[]'::jsonb),
  'rejected', coalesce((select jsonb_agg(r) from (
      select jsonb_build_object('id', v.id, 'accountId', v.account_id, 'title', v.title, 'summary', v.summary,
             'company', (select a.name from public.accounts a where a.id = v.account_id), 'url', v.url) as r
      from public.v_signals v where not v.relevant order by v.created_at desc limit 60) x), '[]'::jsonb),
  'plays', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'accountId', p.account_id, 'playKey', p.play_key, 'status', p.status, 'holdout', p.holdout,
      'persona', p.persona, 'whyNow', p.angle, 'subject', p.subject, 'email', p.email, 'linkedin', p.linkedin,
      'callOpener', p.call_opener, 'quoteUsed', p.quote_used, 'checks', p.checks, 'model', p.model,
      'promptVersion', p.prompt_version, 'createdAt', p.created_at, 'updatedAt', p.updated_at, 'signalIds', p.evidence
    ) order by p.created_at desc) from public.plays p), '[]'::jsonb),
  'events', coalesce((select jsonb_agg(e) from (
      select jsonb_build_object('id', id, 'accountId', account_id, 'playId', play_id, 'signalId', signal_id,
             'type', type, 'payload', payload, 'actor', actor, 'at', created_at) as e
      from public.events order by created_at desc limit 400) x), '[]'::jsonb),
  'runs', coalesce((select jsonb_agg(r) from (
      select jsonb_build_object('id', id, 'kind', kind, 'status', status, 'startedAt', started_at,
             'finishedAt', finished_at, 'stats', stats, 'error', error) as r
      from public.runs where kind <> 'probe' order by id desc limit 60) x), '[]'::jsonb),
  'coverage', coalesce((select jsonb_agg(c) from (
      select jsonb_build_object('ats', a.ats, 'boards', count(*), 'postings', coalesce(sum(a.open_roles), 0)) as c
      from public.accounts a where a.ats is not null group by a.ats) x), '[]'::jsonb),
  'weights', coalesce((select jsonb_agg(to_jsonb(w)) from public.signal_weights w), '[]'::jsonb),
  'roleWeights', coalesce((select jsonb_agg(to_jsonb(w)) from public.role_weights w), '[]'::jsonb)
);
$$;
revoke all on function public.get_desk() from public, anon, authenticated;
grant execute on function public.get_desk() to service_role;

-- Write API for the app: rep actions become events; play status follows the latest action.
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
  values (p_type, p_account, p_play, p_signal, coalesce(p_payload, '{}'::jsonb), left(coalesce(p_actor, 'demo'), 60))
  returning id into v_id;
  if p_play is not null and p_type in ('approved','sent','dismissed') then
    update public.plays set status = p_type, updated_at = now() where id = p_play and status <> 'held_out';
  end if;
  if p_play is not null and p_type = 'edited' then
    update public.plays set subject = coalesce(p_payload->>'subject', subject), email = coalesce(p_payload->>'email', email), updated_at = now()
    where id = p_play;
  end if;
  return v_id;
end $$;
revoke all on function public.log_event(text, bigint, bigint, bigint, jsonb, text) from public, anon, authenticated;
grant execute on function public.log_event(text, bigint, bigint, bigint, jsonb, text) to service_role;
