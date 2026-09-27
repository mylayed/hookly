import "server-only";
import { createHash } from "node:crypto";
import type { CallUsage } from "./analyzer/client";
import { HttpError } from "./api";
import { planFor, type Plan } from "./billing";
import { adminClient } from "./supabase";

// Limits per plan over a rolling 24 hours. Override with env vars.
export type UsageKind = "analyze" | "hooks" | "rewrite";

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export const PLAN_LIMITS: Record<Plan, Record<UsageKind, number>> = {
  free: {
    analyze: num("HOOKCHECK_LIMIT_ANALYZE", 10),
    hooks: num("HOOKCHECK_LIMIT_HOOKS", 10),
    // Opus: the most expensive call.
    rewrite: num("HOOKCHECK_LIMIT_REWRITE", 5),
  },
  // Fair-use caps: generous for real work, still bounded so one account can't
  // spend more on models than it pays.
  pro: {
    analyze: num("HOOKCHECK_PRO_LIMIT_ANALYZE", 100),
    hooks: num("HOOKCHECK_PRO_LIMIT_HOOKS", 100),
    rewrite: num("HOOKCHECK_PRO_LIMIT_REWRITE", 40),
  },
};

// New checks per network. Stops cookie-clearing from resetting the quota,
// while leaving room for a few people behind one router.
const IP_ANALYZE_LIMIT = num("HOOKCHECK_LIMIT_ANALYZE_PER_IP", 30);

// Hard stop for all users together: the most the app may spend on models in 24 hours.
const DAILY_BUDGET_USD = num("HOOKCHECK_DAILY_BUDGET_USD", 25);

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || null;
}

// Only a salted hash is stored, never the address itself.
function ipHash(request: Request): string | null {
  const ip = clientIp(request);
  if (!ip) return null;
  const salt = process.env.HOOKCHECK_IP_SALT ?? process.env.SUPABASE_SECRET_KEY ?? "";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

const hoursUntil = (iso: string | null) =>
  iso ? Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 3_600_000)) : 24;

// Reserves one call of `kind` for the user or throws a 429 with the reason.
// Returns the ledger row to settle once the call finishes.
export async function reserve(kind: UsageKind, userId: string, request: Request): Promise<number> {
  const { plan } = await planFor(userId);
  const limit = PLAN_LIMITS[plan][kind];
  const { data, error } = await adminClient()
    .rpc("reserve_usage", {
      p_user_id: userId,
      // The network limit only guards against free accounts being recreated;
      // a paying account behind a shared router shouldn't hit it.
      p_ip_hash: plan === "pro" ? null : ipHash(request),
      p_kind: kind,
      p_user_limit: limit,
      p_ip_limit: IP_ANALYZE_LIMIT,
      p_budget_usd: DAILY_BUDGET_USD,
    })
    .single<{ event_id: number | null; status: string; used: number; reset_at: string | null }>();
  if (error || !data) throw error ?? new Error("reserve_usage returned nothing");

  switch (data.status) {
    case "ok":
      return data.event_id!;
    case "user_limit":
      throw new HttpError(429, "quota", `Daily limit of ${limit} reached.`, {
        limit,
        hours: hoursUntil(data.reset_at),
        // Tells the client to offer Pro.
        upgrade: plan === "free" ? 1 : 0,
      });
    case "ip_limit":
      throw new HttpError(429, "ip_quota", "Too many checks from this network today.");
    default:
      console.warn(`[limits] daily budget of $${DAILY_BUDGET_USD} reached`);
      throw new HttpError(503, "budget", "Hookly is at capacity for today.");
  }
}

// Records what the call actually cost (for the global budget).
export async function settle(eventId: number, usage: CallUsage) {
  const { error } = await adminClient().from("usage_events").update({ cost_usd: usage.costUsd }).eq("id", eventId);
  if (error) console.error("[limits] could not record cost:", error.message);
}

// Gives the slot back when the call failed, so errors don't eat the quota.
export async function release(eventId: number) {
  const { error } = await adminClient().from("usage_events").delete().eq("id", eventId);
  if (error) console.error("[limits] could not release a reservation:", error.message);
}

// Runs a model call inside a reservation: settled on success, released on
// failure. Returns the result without its usage, which stays server-side.
export async function metered<T extends { usage: CallUsage }>(
  kind: UsageKind,
  userId: string,
  request: Request,
  call: () => Promise<T>,
): Promise<Omit<T, "usage">> {
  const eventId = await reserve(kind, userId, request);
  let result: T;
  try {
    result = await call();
  } catch (err) {
    await release(eventId);
    throw err;
  }
  const { usage, ...rest } = result;
  await settle(eventId, usage);
  console.log(`[${kind}] ${usage.model} $${usage.costUsd.toFixed(4)}`);
  return rest;
}

export interface UsageView {
  kind: UsageKind;
  used: number;
  limit: number;
  // Hours until the next slot frees up; null while none are used.
  resetInHours: number | null;
}

export type UsageSummary = Record<UsageKind, UsageView> & { plan: Plan };

export async function usageFor(userId: string | null): Promise<UsageSummary> {
  const rows = new Map<string, { used: number; oldest: string }>();
  const [{ plan }] = await Promise.all([
    planFor(userId),
    (async () => {
      if (!userId) return;
      const { data, error } = await adminClient().rpc("usage_summary", { p_user_id: userId });
      if (error) throw error;
      for (const r of data as { kind: string; used: number; oldest: string }[]) rows.set(r.kind, r);
    })(),
  ]);
  const view = (kind: UsageKind): UsageView => {
    const r = rows.get(kind);
    return {
      kind,
      used: r?.used ?? 0,
      limit: PLAN_LIMITS[plan][kind],
      resetInHours: r ? hoursUntil(new Date(new Date(r.oldest).getTime() + 24 * 3_600_000).toISOString()) : null,
    };
  };
  return { plan, analyze: view("analyze"), hooks: view("hooks"), rewrite: view("rewrite") };
}
