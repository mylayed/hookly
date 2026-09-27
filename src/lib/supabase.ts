import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { HttpError } from "./api";

// Supabase is used only from route handlers: the browser never talks to it
// directly, so no keys reach the client and no proxy is needed to refresh
// sessions (a route handler can write the refreshed cookies itself).

function env() {
  const url = process.env.SUPABASE_URL;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publishable || !secret) {
    console.error("[supabase] SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY must be set.");
    throw new HttpError(503, "unavailable", "Saving checks is not configured on this server.");
  }
  return { url, publishable, secret };
}

// Acts as the visitor: reads go through row-level security.
export async function userClient(): Promise<SupabaseClient> {
  const { url, publishable } = env();
  const store = await cookies();
  return createServerClient(url, publishable, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) store.set(name, value, options);
      },
    },
  });
}

let admin: SupabaseClient | null = null;

// Bypasses row-level security. Only for writes the visitor must not make
// themselves: saving model output and the usage ledger.
export function adminClient(): SupabaseClient {
  const { url, secret } = env();
  admin ??= createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

// The visitor's user id, or null if they haven't run a check yet.
export async function currentUserId(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.auth.getClaims();
  return data?.claims.sub ?? null;
}

// Every visitor gets an anonymous account on their first check, so history and
// limits work without a sign-up. The session is stored in a cookie.
export async function requireUserId(db: SupabaseClient): Promise<string> {
  const existing = await currentUserId(db);
  if (existing) return existing;
  const { data, error } = await db.auth.signInAnonymously();
  if (error || !data.user) {
    // Most often: anonymous sign-ins are disabled in the Supabase dashboard,
    // or the per-IP sign-up rate limit was hit.
    console.error("[supabase] anonymous sign-in failed:", error?.message);
    throw new HttpError(error?.status === 429 ? 429 : 503, error?.status === 429 ? "rate_limit" : "unavailable", "Could not start a session.");
  }
  return data.user.id;
}
