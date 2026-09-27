-- Week 5 fix: a reservation that never got settled or released (the
-- platform killed the serverless function at its maxDuration before
-- `metered`'s catch could run) used to eat a user's daily limit forever,
-- even though no analysis was ever delivered.
--
-- `usage_events.cost_usd` now stays null until `settle()` records the real
-- cost. A row that is still null once it's older than any call could
-- legitimately still be running is treated as abandoned and stops counting
-- toward the limits, without needing the app to ever come back to it.

alter table public.usage_events alter column cost_usd drop not null;
alter table public.usage_events alter column cost_usd drop default;

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
  -- Longer than the slowest metered route's time budget (currently the
  -- rewrite call's 160s), so a genuinely in-flight call is never mistaken
  -- for an abandoned one.
  v_stale timestamptz := now() - interval '5 minutes';
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

  -- Housekeeping: reservations abandoned a day or more ago have long since
  -- stopped counting either way, so there's no reason to keep them around.
  delete from public.usage_events
  where cost_usd is null and created_at < now() - interval '1 day';

  select count(*), min(e.created_at) into v_used, v_oldest
  from public.usage_events e
  where e.user_id = p_user_id and e.kind = p_kind and e.created_at > v_since
    and (e.cost_usd is not null or e.created_at > v_stale);

  if v_used >= p_user_limit then
    return query select null::bigint, 'user_limit'::text, v_used, v_oldest + interval '24 hours';
    return;
  end if;

  -- Only new checks count toward the network limit: it exists to stop someone
  -- from clearing cookies to get a fresh anonymous user and a fresh quota.
  if p_kind = 'analyze' and p_ip_hash is not null then
    select count(*), min(e.created_at) into v_ip_used, v_ip_oldest
    from public.usage_events e
    where e.ip_hash = p_ip_hash and e.kind = 'analyze' and e.created_at > v_since
      and (e.cost_usd is not null or e.created_at > v_stale);

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

  insert into public.usage_events (user_id, ip_hash, kind, cost_usd)
  values (p_user_id, p_ip_hash, p_kind, null)
  returning id into v_id;

  return query select v_id, 'ok'::text, v_used + 1, null::timestamptz;
end;
$$;

-- Same staleness rule for the UI's usage counters, so they don't show a
-- phantom used slot for a reservation that has already stopped counting
-- toward the actual limit above.
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
    and (e.cost_usd is not null or e.created_at > now() - interval '5 minutes')
  group by e.kind;
$$;

grant execute on function public.reserve_usage(uuid, text, text, int, int, numeric) to service_role;
grant execute on function public.usage_summary(uuid) to service_role;
