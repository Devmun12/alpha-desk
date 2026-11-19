-- Alpha Desk: hiring-signal pipeline for revenue teams
create table public.accounts (
  id bigint generated always as identity primary key,
  name text not null,
  domain text not null unique,
  category text,
  crm_status text not null default 'prospect' check (crm_status in ('prospect','customer','open_opp')),
  ats text check (ats in ('greenhouse','lever','ashby')),
  ats_slug text,
  open_roles int not null default 0,
  sales_roles int not null default 0,
  board_checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.job_posts (
  id bigint generated always as identity primary key,
  account_id bigint not null references public.accounts(id) on delete cascade,
  ats text not null,
  external_id text not null,
  title text not null,
  department text,
  location text,
  url text,
  posted_at timestamptz,
  content text,            -- kept only for postings the prefilter flags
  content_hash text,
  prefilter text[] not null default '{}',
  is_candidate boolean not null default false,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  closed_at timestamptz,
  unique (ats, external_id)
);
create index on public.job_posts (account_id);
create index on public.job_posts (is_candidate) where is_candidate;

create table public.signals (
  id bigint generated always as identity primary key,
  job_post_id bigint not null references public.job_posts(id) on delete cascade,
  account_id bigint not null references public.accounts(id) on delete cascade,
  prompt_version text not null,
  model text not null,
  relevant boolean not null,
  role_family text,
  seniority text,
  signal_types text[] not null default '{}',
  products text[] not null default '{}',
  current_tools jsonb not null default '[]',
  evidence jsonb not null default '[]',   -- only quotes verified verbatim against the posting
  facts jsonb not null default '{}',
  summary text,
  confidence numeric,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  created_at timestamptz not null default now(),
  unique (job_post_id, prompt_version)
);
create index on public.signals (account_id);

create table public.plays (
  id bigint generated always as identity primary key,
  account_id bigint not null references public.accounts(id) on delete cascade,
  play_key text not null,
  status text not null default 'draft' check (status in ('draft','approved','sent','dismissed','held_out')),
  holdout boolean not null default false,
  persona text,
  angle text,
  subject text,
  email text,
  linkedin text,
  call_opener text,
  evidence jsonb not null default '[]',   -- signal ids the draft was built from
  model text,
  prompt_version text,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, play_key, prompt_version)
);

create table public.events (
  id bigint generated always as identity primary key,
  account_id bigint references public.accounts(id) on delete cascade,
  play_id bigint references public.plays(id) on delete cascade,
  signal_id bigint references public.signals(id) on delete cascade,
  type text not null check (type in ('surfaced','viewed','approved','edited','sent','dismissed','signal_up','signal_down','replied','meeting','opportunity')),
  payload jsonb not null default '{}',
  actor text not null default 'system',
  created_at timestamptz not null default now()
);
create index on public.events (account_id);
create index on public.events (type, created_at);

create table public.runs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('ingest','extract','draft','notify','probe')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','ok','partial','error')),
  stats jsonb not null default '{}',
  error text
);

-- No policies: anon and authenticated cannot touch any table. The api edge function is the only door.
alter table public.accounts enable row level security;
alter table public.job_posts enable row level security;
alter table public.signals enable row level security;
alter table public.plays enable row level security;
alter table public.events enable row level security;
alter table public.runs enable row level security;
