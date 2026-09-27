import { errorResponse, HttpError } from "@/lib/api";
import { currentAccount } from "@/lib/auth";
import { planFor, startCheckout } from "@/lib/billing";
import { userClient } from "@/lib/supabase";

// Creates the Pro transaction the browser opens in Paddle's checkout. Needs a
// real account: a subscription on an anonymous user would be lost with the cookies.
export async function POST() {
  try {
    const me = await currentAccount(await userClient());
    if (!me) throw new HttpError(401, "unauthorized", "Sign in first.");
    if ((await planFor(me.id)).plan === "pro") throw new HttpError(409, "already_subscribed", "You already have Pro.");
    return Response.json(await startCheckout(me));
  } catch (err) {
    return errorResponse(err);
  }
}
