import type { EmailOtpType } from "@supabase/supabase-js";
import { anonymousUserId, mergeAnonymous, safeNext, siteUrl } from "@/lib/auth";
import { userClient } from "@/lib/supabase";

// Optional email-template flow: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email.
// Unlike the default link, it also works when the email is opened in another browser.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const site = siteUrl(request);
  const next = safeNext(url.searchParams.get("next"));
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "email") as EmailOtpType;

  try {
    if (!tokenHash) throw new Error("missing token_hash");
    const db = await userClient();
    const anonId = await anonymousUserId(db);
    const { data, error } = await db.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error || !data.user) throw error ?? new Error("no user");
    await mergeAnonymous(anonId, data.user.id);
    const target = new URL(`${site}${next}`);
    target.searchParams.set("signed_in", "1");
    return Response.redirect(target.toString(), 303);
  } catch (err) {
    console.error("[auth] confirm failed:", err instanceof Error ? err.message : err);
    return Response.redirect(`${site}/account?auth_error=1`, 303);
  }
}
