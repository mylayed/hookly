import { anonymousUserId, mergeAnonymous, safeNext, siteUrl } from "@/lib/auth";
import { userClient } from "@/lib/supabase";

// Google and the email link both come back here with a one-time code.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const site = siteUrl(request);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");

  try {
    if (!code) throw new Error(url.searchParams.get("error_description") ?? "missing code");
    const db = await userClient();
    // Read before the exchange: afterwards the session is the real account.
    const anonId = await anonymousUserId(db);
    const { data, error } = await db.auth.exchangeCodeForSession(code);
    if (error) throw error;
    await mergeAnonymous(anonId, data.user.id);
    return Response.redirect(withFlag(`${site}${next}`, "signed_in"), 303);
  } catch (err) {
    console.error("[auth] callback failed:", err instanceof Error ? err.message : err);
    return Response.redirect(`${site}/account?auth_error=1`, 303);
  }
}

function withFlag(target: string, flag: string) {
  const u = new URL(target);
  u.searchParams.set(flag, "1");
  return u.toString();
}
