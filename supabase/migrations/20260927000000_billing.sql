-- Week 5: paid plan through Paddle.
--
-- Paddle is the source of truth. These tables are a local copy kept in sync by
-- the webhook (and right after checkout / on the account page), so every
-- request can check the plan without calling Paddle.
--
-- Safe to run more than once, and over the earlier Stripe draft of this file.

-- One Paddle customer per account, created on the first checkout.
-- No policies: only the server reads it.
create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  customer_id text not null unique,
  created_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'billing_customers' and column_name = 'stripe_customer_id'
  ) then
    alter table public.billing_customers rename column stripe_customer_id to customer_id;
  end if;
end $$;

alter table public.billing_customers enable row level security;

-- One row per Paddle subscription, whatever its status.
create table if not exists public.subscriptions (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null,
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_idx on public.subscriptions (user_id);

alter table public.subscriptions enable row level security;

drop policy if exists "Users read their own subscriptions" on public.subscriptions;
create policy "Users read their own subscriptions"
  on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);
