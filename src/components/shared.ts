import type { Analysis, Hook, Rewrite, RiskBeat } from "@/lib/analyzer/analyze";
import type { Pace, Platform } from "@/lib/analyzer/config";
import type { Messages } from "@/lib/i18n";

export type AnalysisView = Omit<Analysis, "usage">;
export type RewriteView = Omit<Rewrite, "usage">;
export type { Hook, RiskBeat };
export type { CheckSummary, SavedCheck } from "@/lib/checks";
export type { UsageKind, UsageSummary, UsageView } from "@/lib/limits";
export type { Plan, SubscriptionView } from "@/lib/billing";
export type { Me } from "@/lib/auth";

export interface Draft {
  script: string;
  platform: Platform;
  niche: string;
  pace: Pace;
}

// Carries the server's error code so the UI can phrase it in the current language.
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public params: Record<string, number> = {},
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("network", "Could not reach the server.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.code ?? "server", data.error ?? "The request failed. Try again.", data.params);
  return data as T;
}

export const get = <T>(url: string) => request<T>(url);
export const del = (url: string) => request<void>(url, { method: "DELETE" });
export const post = <T>(url: string, body: unknown) =>
  request<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function errorText(err: unknown, m: Messages): string {
  if (!(err instanceof ApiError)) return m.errors.server;
  const e = m.errors;
  switch (err.code) {
    case "too_long":
      return e.too_long(err.params.limit ?? 0, err.params.count ?? 0);
    case "quota":
      return e.quota(err.params.limit ?? 0, err.params.hours ?? 24);
    case "invalid_request":
    case "empty":
    case "refusal":
    case "truncated":
    case "invalid_output":
    case "rate_limit":
    case "network":
    case "server":
    case "ip_quota":
    case "budget":
    case "not_found":
    case "unavailable":
    case "invalid_email":
    case "auth_failed":
    case "email_rate_limit":
    case "unauthorized":
    case "billing_unavailable":
    case "already_subscribed":
      return e[err.code];
    default:
      return err.message || e.server;
  }
}

export function levelTone(score: number): "low" | "mid" | "high" {
  if (score >= 4) return "low";
  if (score === 3) return "mid";
  return "high";
}

export function totalTone(total: number): "low" | "mid" | "high" {
  if (total >= 75) return "low";
  if (total >= 60) return "mid";
  return "high";
}
