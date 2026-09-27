-- Week 4: check history and usage limits.
--
-- Every visitor gets an anonymous Supabase user on their first check (the
-- session lives in a cookie). Users can read and delete only their own checks;
-- all writes and the usage ledger go through the server's secret key.

-- One saved check: the script as it was checked plus everything the models returned.
create table public.checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  script text not null,
  -- First line of the script, for the history list (so the list never loads full scripts).
  title text generated always as (left(split_part(btrim(script, E' \n\r\t'), E'\n', 1), 140)) stored,
  platform text not null,
  niche text not null default '',
  pace text not null,
  -- Language the feedback was written in.
  locale text not null,
  total smallint not null,
  verdict text not null,
  analysis jsonb not null,
  hooks jsonb,
  rewrite jsonb
);

create index checks_user_created_idx on public.checks (user_id, created_at desc);

alter table public.checks enable row level security;

create policy "Users read their own checks"
  on public.checks for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users delete their own checks"
  on public.checks for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Ledger of model calls, used for per-user, per-network and global daily limits.
-- No policies: only the service role can read or write it.
create table public.usage_events (
  id bigint generated always as identity primary key,
  -- Kept after a user is deleted so the global budget still counts their spend.
  user_id uuid references auth.users (id) on delete set null,
  ip_hash text,
  kind text not null check (kind in ('analyze', 'hooks', 'rewrite')),
  cost_usd numeric(10, 5) not null default 0,
  created_at timestamptz not null default now()
);

create index usage_events_user_idx on public.usage_events (user_id, kind, created_at desc);
create index usage_events_ip_idx on public.usage_events (ip_hash, created_at desc) where ip_hash is not null;
create index usage_events_created_idx on public.usage_events (created_at desc);

alter table public.usage_events enable row level security;

-- Checks all limits over a rolling 24 hours and, if there is room, reserves a
-- slot in the same transaction, so parallel requests can't overshoot a limit.
-- The server releases the slot (deletes the row) if the model call fails, and
-- records the real cost if it succeeds.
--
-- status: 'ok' | 'user_limit' | 'ip_limit' | 'budget'
-- reset_at: when the oldest counted event leaves the window (null for 'ok').
create or replace function public.reserve_usage(
  p_user_id uuid,
  p_ip_hash text,
  p_kind text,
  p_user_limit int,
  p_ip_limit int,
  p_budget_usd numeric
)
returns table (event_id bigint, status text, used int, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - interval '24 hours';
  v_used int;
  v_oldest timestamptz;
  v_ip_used int;
  v_ip_oldest timestamptz;
  v_spent numeric;
  v_id bigint;
begin
  -- User lock first, then network lock: every caller takes them in this order,
  -- so two requests can't deadlock.
  perform pg_advisory_xact_lock(hashtextextended('usage:user:' || p_user_id::text, 0));
  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('usage:ip:' || p_ip_hash, 0));
  end if;

  select count(*), min(e.created_at) into v_used, v_oldest
  from public.usage_events e
  where e.user_id = p_user_id and e.kind = p_kind and e.created_at > v_since;

  if v_used >= p_user_limit then
    return query select null::bigint, 'user_limit'::text, v_used, v_oldest + interval '24 hours';
    return;
  end if;

  -- Only new checks count toward the network limit: it exists to stop someone
  -- from clearing cookies to get a fresh anonymous user and a fresh quota.
  if p_kind = 'analyze' and p_ip_hash is not null then
    select count(*), min(e.created_at) into v_ip_used, v_ip_oldest
    from public.usage_events e
    where e.ip_hash = p_ip_hash and e.kind = 'analyze' and e.created_at > v_since;

    if v_ip_used >= p_ip_limit then
      return query select null::bigint, 'ip_limit'::text, v_used, v_ip_oldest + interval '24 hours';
      return;
    end if;
  end if;

  select coalesce(sum(e.cost_usd), 0) into v_spent
  from public.usage_events e
  where e.created_at > v_since;

  if v_spent >= p_budget_usd then
    return query select null::bigint, 'budget'::text, v_used, null::timestamptz;
    return;
  end if;

  insert into public.usage_events (user_id, ip_hash, kind)
  values (p_user_id, p_ip_hash, p_kind)
  returning id into v_id;

  return query select v_id, 'ok'::text, v_used + 1, null::timestamptz;
end;
$$;

-- Usage counters for the UI: how many of each kind the user spent in the last 24 hours.
create or replace function public.usage_summary(p_user_id uuid)
returns table (kind text, used int, oldest timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.kind, count(*)::int, min(e.created_at)
  from public.usage_events e
  where e.user_id = p_user_id and e.created_at > now() - interval '24 hours'
  group by e.kind;
$$;

revoke all on function public.reserve_usage(uuid, text, text, int, int, numeric) from public, anon, authenticated;
revoke all on function public.usage_summary(uuid) from public, anon, authenticated;
grant execute on function public.reserve_usage(uuid, text, text, int, int, numeric) to service_role;
grant execute on function public.usage_summary(uuid) to service_role;
