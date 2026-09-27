import { errorResponse } from "@/lib/api";
import { userClient } from "@/lib/supabase";

export async function POST() {
  try {
    // Local scope: other devices stay signed in.
    await (await userClient()).auth.signOut({ scope: "local" });
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
