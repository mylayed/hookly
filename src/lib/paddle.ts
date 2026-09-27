import { createHmac, timingSafeEqual } from "node:crypto";

// Minimal Paddle Billing API client (plain fetch, no SDK). Shared by the app
// and scripts/paddle-setup.ts, so it doesn't import "server-only".

export type PaddleEnv = "sandbox" | "production";

export function paddleEnv(): PaddleEnv {
  const explicit = process.env.PADDLE_ENV;
  if (explicit === "sandbox" || explicit === "production") return explicit;
  // Sandbox API keys contain "sdbx".
  return process.env.PADDLE_API_KEY?.includes("sdbx") ? "sandbox" : "production";
}

export class PaddleError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "PaddleError";
  }
}

export async function paddle<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  const key = process.env.PADDLE_API_KEY;
  if (!key) throw new PaddleError(0, "not_configured", "PADDLE_API_KEY is not set.");
  const base = paddleEnv() === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json?.error ?? {};
    throw new PaddleError(res.status, e.code ?? "unknown", e.detail ?? `Paddle ${method} ${path} failed with ${res.status}`);
  }
  return json.data as T;
}

// Only the fields Hookly reads.
export interface PaddlePrice {
  id: string;
  product_id: string;
  status: string;
  unit_price: { amount: string; currency_code: string };
  billing_cycle: { interval: "day" | "week" | "month" | "year"; frequency: number } | null;
}

export interface PaddleSubscription {
  id: string;
  status: "active" | "canceled" | "past_due" | "paused" | "trialing";
  customer_id: string;
  custom_data: Record<string, string> | null;
  current_billing_period: { starts_at: string; ends_at: string } | null;
  scheduled_change: { action: "cancel" | "pause" | "resume"; effective_at: string } | null;
  items: { price: { id: string } }[];
}

export interface PaddleTransaction {
  id: string;
  status: string;
  customer_id: string | null;
  subscription_id: string | null;
  custom_data: Record<string, string> | null;
}

// Paddle-Signature: "ts=<unix>;h1=<hex hmac of `${ts}:${rawBody}`>".
export function verifyWebhook(rawBody: string, header: string | null, secret: string, toleranceSeconds = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(";").map((p) => p.split("=", 2) as [string, string]));
  const ts = Number(parts.ts);
  if (!parts.h1 || !Number.isFinite(ts)) return false;
  // Paddle suggests 5 s; a few minutes absorbs clock drift and retries.
  if (Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${parts.ts}:${rawBody}`).digest();
  const given = Buffer.from(parts.h1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
