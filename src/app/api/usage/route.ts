import { errorResponse } from "@/lib/api";
import { usageFor } from "@/lib/limits";
import { currentUserId, userClient } from "@/lib/supabase";

export async function GET() {
  try {
    return Response.json(await usageFor(await currentUserId(await userClient())));
  } catch (err) {
    return errorResponse(err);
  }
}
