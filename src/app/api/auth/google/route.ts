import { safeNext, siteUrl } from "@/lib/auth";
import { userClient } from "@/lib/supabase";

// Starts Google sign-in: Supabase returns the consent-screen URL and stores
// the PKCE verifier in a cookie, which /auth/callback uses to finish.
export async function GET(request: Request) {
  const site = siteUrl(request);
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  try {
    const db = await userClient();
    const callback = new URL("/auth/callback", site);
    callback.searchParams.set("next", next);
    const { data, error } = await db.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
    });
    if (error || !data.url) throw error ?? new Error("no OAuth URL");
    return Response.redirect(data.url, 303);
  } catch (err) {
    console.error("[auth] Google sign-in failed to start:", err);
    return Response.redirect(`${site}/account?auth_error=1`, 303);
  }
}
