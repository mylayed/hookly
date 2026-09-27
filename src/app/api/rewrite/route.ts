import { rewriteWeakSpots } from "@/lib/analyzer/analyze";
import { CheckActionRequest, errorResponse, readJson } from "@/lib/api";
import { saveExtras } from "@/lib/checks";
import { metered } from "@/lib/limits";
import { loadOwnCheck } from "@/lib/check-action";

export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    const { userId, check, input } = await loadOwnCheck(await readJson(request, CheckActionRequest));
    const rewrite = await metered("rewrite", userId, request, () => rewriteWeakSpots(input, check.analysis));
    await saveExtras(check.id, { rewrite });
    return Response.json(rewrite);
  } catch (err) {
    return errorResponse(err);
  }
}
