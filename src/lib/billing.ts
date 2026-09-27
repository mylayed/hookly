import "server-only";
import { HttpError } from "./api";
import type { Me } from "./auth";
import {
  paddle,
  paddleEnv,
  PaddleError,
  type PaddleEnv,
  type PaddlePrice,
  type PaddleSubscription,
  type PaddleTransaction,
} from "./paddle";
import { adminClient } from "./supabase";

// Pro subscription through Paddle Billing. Paddle is the merchant of record:
// it charges the card, handles tax in every country and pays out to Ukraine.
// The browser opens Paddle's overlay checkout for a transaction the server
// creates; the subscription is copied into `public.subscriptions` (by the
// webhook, and right after checkout) so limits can check the plan locally.

export type Plan = "free" | "pro";

// Paddle keeps a subscription usable while it retries a failed payment (past_due).
const PAID_STATUSES = ["active", "trialing", "past_due"];

export function billingConfigured(): boolean {
  return Boolean(process.env.PADDLE_API_KEY && process.env.PADDLE_CLIENT_TOKEN && process.env.PADDLE_PRO_PRICE_ID);
}

function requireConfigured() {
  if (!billingConfigured()) {
    console.error("[billing] PADDLE_API_KEY, PADDLE_CLIENT_TOKEN and PADDLE_PRO_PRICE_ID must be set.");
    throw new HttpError(503, "billing_unavailable", "Payments are not configured on this server.");
  }
}

// Paddle API failures become a generic "payments unavailable" for the visitor.
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PaddleError) {
      console.error(`[billing] Paddle ${err.status} ${err.code}: ${err.message}`);
      throw new HttpError(502, "billing_unavailable", "Payments are not available right now.");
    }
    throw err;
  }
}

let cachedPrice: { at: number; price: PaddlePrice } | null = null;

export async function proPrice(): Promise<PaddlePrice> {
  requireConfigured();
  if (cachedPrice && Date.now() - cachedPrice.at < 10 * 60_000) return cachedPrice.price;
  const price = await call(() => paddle<PaddlePrice>("GET", `/prices/${process.env.PADDLE_PRO_PRICE_ID}`));
  cachedPrice = { at: Date.now(), price };
  return price;
}

export interface SubscriptionView {
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

// The plan behind the limits. Never throws: if billing tables are missing or
// the database blips, the user just gets free limits for that request.
export async function planFor(userId: string | null): Promise<{ plan: Plan; subscription: SubscriptionView | null }> {
  if (!userId) return { plan: "free", subscription: null };
  const { data, error } = await adminClient()
    .from("subscriptions")
    .select("status, current_period_end, cancel_at_period_end")
    .eq("user_id", userId)
    .in("status", PAID_STATUSES)
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle<{ status: string; current_period_end: string | null; cancel_at_period_end: boolean }>();
  if (error) {
    console.error("[billing] plan lookup failed:", error.message);
    return { plan: "free", subscription: null };
  }
  if (!data) return { plan: "free", subscription: null };
  return {
    plan: "pro",
    subscription: {
      status: data.status,
      currentPeriodEnd: data.current_period_end,
      cancelAtPeriodEnd: data.cancel_at_period_end,
    },
  };
}

async function customerIdFor(userId: string): Promise<string | null> {
  const { data } = await adminClient()
    .from("billing_customers")
    .select("customer_id")
    .eq("user_id", userId)
    .maybeSingle<{ customer_id: string }>();
  return data?.customer_id ?? null;
}

async function userForCustomer(customerId: string): Promise<string | null> {
  const { data } = await adminClient()
    .from("billing_customers")
    .select("user_id")
    .eq("customer_id", customerId)
    .maybeSingle<{ user_id: string }>();
  return data?.user_id ?? null;
}

// One Paddle customer per account. Paddle customers are unique by email, so an
// existing one (e.g. from an earlier, deleted Hookly account) is reused.
async function getOrCreateCustomer(me: Me): Promise<string> {
  const existing = await customerIdFor(me.id);
  if (existing) return existing;
  if (!me.email) throw new HttpError(400, "billing_unavailable", "Your account has no email address.");

  const found = await call(() =>
    paddle<{ id: string }[]>("GET", `/customers?email=${encodeURIComponent(me.email!)}`),
  );
  const customerId =
    found[0]?.id ??
    (await call(() => paddle<{ id: string }>("POST", "/customers", { email: me.email, name: me.name ?? undefined }))).id;

  const { error } = await adminClient().from("billing_customers").upsert({ user_id: me.id, customer_id: customerId });
  if (error) throw error;
  return customerId;
}

export interface CheckoutStart {
  transactionId: string;
  clientToken: string;
  environment: PaddleEnv;
}

// A draft transaction for Pro; the browser opens Paddle's overlay for it.
// Creating it here (not in the browser) keeps the user id tamper-proof.
export async function startCheckout(me: Me): Promise<CheckoutStart> {
  requireConfigured();
  const customerId = await getOrCreateCustomer(me);
  const txn = await call(() =>
    paddle<PaddleTransaction>("POST", "/transactions", {
      items: [{ price_id: process.env.PADDLE_PRO_PRICE_ID, quantity: 1 }],
      customer_id: customerId,
      custom_data: { user_id: me.id },
      collection_mode: "automatic",
    }),
  );
  return { transactionId: txn.id, clientToken: process.env.PADDLE_CLIENT_TOKEN!, environment: paddleEnv() };
}

// After checkout.completed. The subscription appears a moment after the
// payment, so the caller retries while this returns false.
export async function syncTransaction(userId: string, transactionId: string): Promise<boolean> {
  requireConfigured();
  const txn = await call(() => paddle<PaddleTransaction>("GET", `/transactions/${encodeURIComponent(transactionId)}`));
  // Only the account that started this checkout may sync it.
  if (txn.custom_data?.user_id !== userId) throw new HttpError(404, "not_found", "Unknown transaction.");
  if (!txn.subscription_id) return false;
  await syncSubscription(txn.subscription_id);
  return true;
}

// Copies one subscription from Paddle into the database. Always re-reads it,
// so repeated or out-of-order webhook events are harmless.
export async function syncSubscription(subscriptionId: string) {
  const sub = await paddle<PaddleSubscription>("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  const userId = sub.custom_data?.user_id || (await userForCustomer(sub.customer_id));
  if (!userId) {
    console.warn(`[billing] subscription ${sub.id} has no Hookly user; skipped.`);
    return;
  }
  const { error } = await adminClient()
    .from("subscriptions")
    .upsert({
      id: sub.id,
      user_id: userId,
      status: sub.status,
      price_id: sub.items[0]?.price.id ?? null,
      current_period_end: sub.current_billing_period?.ends_at ?? null,
      cancel_at_period_end: sub.scheduled_change?.action === "cancel",
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

async function subscriptionIdsFor(customerId: string): Promise<string[]> {
  const subs = await paddle<{ id: string; status: string }[]>(
    "GET",
    `/subscriptions?customer_id=${encodeURIComponent(customerId)}&per_page=20`,
  );
  return subs.map((s) => s.id);
}

// Re-reads all of the user's subscriptions. The account page calls it, so a
// cancellation made in Paddle's portal shows up even without the webhook.
export async function syncCustomer(userId: string) {
  if (!billingConfigured()) return;
  const customerId = await customerIdFor(userId);
  if (!customerId) return;
  try {
    for (const id of await subscriptionIdsFor(customerId)) await syncSubscription(id);
  } catch (err) {
    console.error("[billing] customer sync failed:", err instanceof Error ? err.message : err);
  }
}

// Paddle's customer portal: payment method, invoices, cancel.
export async function portalUrl(userId: string): Promise<string> {
  requireConfigured();
  const customerId = await customerIdFor(userId);
  if (!customerId) throw new HttpError(404, "not_found", "No billing account yet.");
  const ids = await call(() => subscriptionIdsFor(customerId));
  const session = await call(() =>
    paddle<{ urls: { general: { overview: string } } }>("POST", `/customers/${customerId}/portal-sessions`, {
      subscription_ids: ids.slice(0, 25),
    }),
  );
  return session.urls.general.overview;
}

// Account deletion: stop charging right away.
export async function cancelEverything(userId: string) {
  if (!billingConfigured()) return;
  const customerId = await customerIdFor(userId);
  if (!customerId) return;
  const subs = await paddle<{ id: string; status: string }[]>(
    "GET",
    `/subscriptions?customer_id=${encodeURIComponent(customerId)}&per_page=20`,
  );
  for (const sub of subs) {
    if (sub.status !== "canceled") {
      await paddle("POST", `/subscriptions/${sub.id}/cancel`, { effective_from: "immediately" });
    }
  }
}
