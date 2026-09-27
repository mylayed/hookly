import { syncSubscription } from "@/lib/billing";
import { verifyWebhook } from "@/lib/paddle";

// Paddle → Hookly. Keeps `public.subscriptions` in step with renewals,
// failed payments and cancellations that happen outside the app.
export async function POST(request: Request) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 400 });

  // The signature covers the raw body, so read it as text before parsing.
  const raw = await request.text();
  if (!verifyWebhook(raw, request.headers.get("paddle-signature"), secret)) {
    console.error("[billing] bad webhook signature");
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(raw) as { event_type: string; data: { id: string; subscription_id?: string | null } };
  try {
    if (event.event_type.startsWith("subscription.")) {
      await syncSubscription(event.data.id);
    } else if (event.event_type === "transaction.completed" && event.data.subscription_id) {
      await syncSubscription(event.data.subscription_id);
    }
    return new Response(null, { status: 200 });
  } catch (err) {
    // A non-2xx response makes Paddle retry the event later.
    console.error(`[billing] webhook ${event.event_type} failed:`, err instanceof Error ? err.message : err);
    return new Response("Sync failed", { status: 500 });
  }
}
