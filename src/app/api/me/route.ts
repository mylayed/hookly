import { errorResponse, HttpError } from "@/lib/api";
import { currentAccount } from "@/lib/auth";
import { cancelEverything } from "@/lib/billing";
import { adminClient, userClient } from "@/lib/supabase";

// The signed-in account, or null for guests (including anonymous users).
export async function GET() {
  try {
    return Response.json({ user: await currentAccount(await userClient()) });
  } catch (err) {
    return errorResponse(err);
  }
}

// Deletes the account; checks go with it (on delete cascade).
export async function DELETE() {
  try {
    const db = await userClient();
    const me = await currentAccount(db);
    if (!me) throw new HttpError(401, "unauthorized", "Sign in first.");
    // Stop any subscription first: a deleted account must never be charged again.
    await cancelEverything(me.id);
    // Sign out first so the cookie never holds a token for a deleted user.
    await db.auth.signOut({ scope: "local" });
    const { error } = await adminClient().auth.admin.deleteUser(me.id);
    if (error) throw error;
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
