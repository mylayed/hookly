import { errorResponse, HttpError } from "@/lib/api";
import { currentAccount } from "@/lib/auth";
import { portalUrl } from "@/lib/billing";
import { userClient } from "@/lib/supabase";

// Paddle's customer portal: payment method, invoices, cancel.
export async function POST() {
  try {
    const me = await currentAccount(await userClient());
    if (!me) throw new HttpError(401, "unauthorized", "Sign in first.");
    return Response.json({ url: await portalUrl(me.id) });
  } catch (err) {
    return errorResponse(err);
  }
}
