import { generateHooks } from "@/lib/analyzer/analyze";
import { CheckActionRequest, errorResponse, readJson } from "@/lib/api";
import { saveExtras } from "@/lib/checks";
import { metered } from "@/lib/limits";
import { loadOwnCheck } from "@/lib/check-action";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { userId, check, input } = await loadOwnCheck(await readJson(request, CheckActionRequest));
    const { hooks } = await metered("hooks", userId, request, () => generateHooks(input, check.analysis));
    await saveExtras(check.id, { hooks });
    return Response.json({ hooks });
  } catch (err) {
    return errorResponse(err);
  }
}
