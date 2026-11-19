-- One-time account discovery: probe every slug guess on all three public job-board APIs
-- in parallel with pg_net, then keep the board with the most roles per company.
-- Input: ops.probe(domain, ats, slug, url) rows generated from pipeline/companies.py.
create schema if not exists ops;
create table if not exists ops.probe (domain text, ats text, slug text, url text, request_id bigint, status int, n_jobs int,
                                      primary key (domain, ats, slug));

-- 1. fire requests (async)
update ops.probe set request_id = net.http_get(url := url, timeout_milliseconds := 20000) where request_id is null;

-- 2. after a minute, read the responses
update ops.probe p set status = r.status_code,
  n_jobs = case when r.status_code <> 200 then 0
                when p.ats = 'lever' then jsonb_array_length(case when jsonb_typeof(r.content::jsonb) = 'array' then r.content::jsonb else '[]' end)
                else coalesce(jsonb_array_length(r.content::jsonb -> 'jobs'), 0) end
from net._http_response r where r.id = p.request_id;

-- 3. pick one board per company (ambiguous slugs such as "unit" or "remote" were checked by hand and excluded)
with ranked as (
  select p.*, row_number() over (partition by p.domain order by p.n_jobs desc) as rn
  from ops.probe p where p.n_jobs > 0
)
update public.accounts a set ats = r.ats, ats_slug = r.slug from ranked r where r.rn = 1 and r.domain = a.domain;
