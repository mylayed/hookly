import { z } from "zod";
import { errorResponse, HttpError } from "@/lib/api";
import { safeNext, siteUrl } from "@/lib/auth";
import { userClient } from "@/lib/supabase";

const EmailRequest = z.object({
  email: z.email().max(254),
  next: z.string().max(500).optional(),
});

// Sends a one-time sign-in link. The link lands on /auth/callback in this
// browser, which finishes the sign-in and moves this browser's checks over.
export async function POST(request: Request) {
  try {
    const parsed = EmailRequest.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "invalid_email", "Enter a valid email address.");
    const { email, next } = parsed.data;

    const db = await userClient();
    const callback = new URL("/auth/callback", siteUrl(request));
    callback.searchParams.set("next", safeNext(next));
    const { error } = await db.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callback.toString(), shouldCreateUser: true },
    });
    if (error) {
      console.error("[auth] email link failed:", error.status, error.code, error.message);
      if (error.status === 429) throw new HttpError(429, "email_rate_limit", "Too many sign-in emails. Wait a minute and try again.");
      throw new HttpError(502, "auth_failed", "Sign-in didn't go through. Try again.");
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}

