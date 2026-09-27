import { z } from "zod";
import { errorResponse, HttpError, readJson } from "@/lib/api";
import { currentAccount } from "@/lib/auth";
import { syncTransaction } from "@/lib/billing";
import { userClient } from "@/lib/supabase";

const SyncRequest = z.object({ transactionId: z.string().regex(/^txn_[a-z0-9]+$/) });

// Called by the browser after Paddle's checkout.completed, so Pro turns on
// without waiting for the webhook. `synced: false` means "try again shortly".
export async function POST(request: Request) {
  try {
    const me = await currentAccount(await userClient());
    if (!me) throw new HttpError(401, "unauthorized", "Sign in first.");
    const { transactionId } = await readJson(request, SyncRequest);
    return Response.json({ synced: await syncTransaction(me.id, transactionId) });
  } catch (err) {
    return errorResponse(err);
  }
}
