import { errorResponse } from "@/lib/api";
import { billingConfigured, planFor, proPrice, syncCustomer } from "@/lib/billing";
import { PLAN_LIMITS } from "@/lib/limits";
import { currentUserId, userClient } from "@/lib/supabase";

// Plan, subscription and Pro price for the pricing and account pages.
// ?refresh=1 re-reads the subscription from Paddle first (account page), so
// changes made in Paddle's portal show up even when the webhook can't reach us.
export async function GET(request: Request) {
  try {
    const userId = await currentUserId(await userClient());
    if (userId && new URL(request.url).searchParams.has("refresh")) await syncCustomer(userId);
    const { plan, subscription } = await planFor(userId);
    let price: { amount: number; currency: string; interval: string } | null = null;
    if (billingConfigured()) {
      try {
        const p = await proPrice();
        price = {
          amount: Number(p.unit_price.amount) / 100,
          currency: p.unit_price.currency_code.toLowerCase(),
          interval: p.billing_cycle?.interval ?? "month",
        };
      } catch {
        // Shown as "not available" on the pricing page; the error is logged in proPrice.
      }
    }
    return Response.json({ plan, subscription, price, limits: PLAN_LIMITS });
  } catch (err) {
    return errorResponse(err);
  }
}
