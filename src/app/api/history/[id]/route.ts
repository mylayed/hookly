import { z } from "zod";
import { errorResponse, HttpError } from "@/lib/api";
import { deleteCheck, getCheck } from "@/lib/checks";
import { userClient } from "@/lib/supabase";

async function checkId(ctx: RouteContext<"/api/history/[id]">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, "not_found", "This check no longer exists.");
  return id;
}

export async function GET(_request: Request, ctx: RouteContext<"/api/history/[id]">) {
  try {
    return Response.json(await getCheck(await userClient(), await checkId(ctx)));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/history/[id]">) {
  try {
    await deleteCheck(await userClient(), await checkId(ctx));
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
