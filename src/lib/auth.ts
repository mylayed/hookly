import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "./supabase";

// Real accounts (Google or an email link) on top of the anonymous users that
// every visitor gets on their first check.
//
// Sign-in always creates or reuses a normal account, and then the anonymous
// user this browser had is folded into it: its checks and usage move over and
// the anonymous user is deleted. That works the same whether the account is
// new or already existed on another device, so nothing is lost either way.

export type AuthProvider = "google" | "email";

export interface Me {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  provider: AuthProvider;
  createdAt: string;
}

// The anonymous user behind the current session, read from a verified JWT
// before the sign-in replaces it. Null for no session or a real account.
export async function anonymousUserId(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.auth.getClaims();
  const claims = data?.claims;
  return claims?.is_anonymous ? claims.sub : null;
}

export async function mergeAnonymous(fromId: string | null, toId: string) {
  if (!fromId || fromId === toId) return;
  const admin = adminClient();
  const moved = await Promise.all([
    admin.from("checks").update({ user_id: toId }).eq("user_id", fromId),
    admin.from("usage_events").update({ user_id: toId }).eq("user_id", fromId),
  ]);
  const failed = moved.find((r) => r.error);
  if (failed) {
    // Keep the anonymous user so nothing is deleted with it; the account still works.
    console.error("[auth] could not move anonymous data:", failed.error?.message);
    return;
  }
  const { error } = await admin.auth.admin.deleteUser(fromId);
  if (error) console.error("[auth] could not delete the anonymous user:", error.message);
}

// Where to send the visitor after sign-in. Only same-site paths are allowed,
// so the link can't be used to bounce someone to another site.
export function safeNext(next: string | null | undefined, fallback = "/account"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

// Public URL of the app, for links in emails and OAuth redirects.
export function siteUrl(request: Request): string {
  return (process.env.SITE_URL ?? new URL(request.url).origin).replace(/\/$/, "");
}

export async function currentAccount(db: SupabaseClient): Promise<Me | null> {
  const { data, error } = await db.auth.getUser();
  const user = data.user;
  if (error || !user || user.is_anonymous) return null;
  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? null,
    name: meta.full_name ?? meta.name ?? null,
    avatarUrl: meta.avatar_url ?? meta.picture ?? null,
    provider: user.app_metadata?.provider === "google" ? "google" : "email",
    createdAt: user.created_at,
  };
}
