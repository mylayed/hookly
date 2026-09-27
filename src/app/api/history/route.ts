import { errorResponse } from "@/lib/api";
import { listChecks } from "@/lib/checks";
import { currentUserId, userClient } from "@/lib/supabase";

export async function GET() {
  try {
    const db = await userClient();
    // Visitors who never ran a check have no account yet, so nothing to list.
    if (!(await currentUserId(db))) return Response.json({ checks: [] });
    return Response.json({ checks: await listChecks(db) });
  } catch (err) {
    return errorResponse(err);
  }
}
