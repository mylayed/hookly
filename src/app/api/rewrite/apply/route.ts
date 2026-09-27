import { CheckActionRequest, errorResponse, HttpError, readJson } from "@/lib/api";
import { saveCheck } from "@/lib/checks";
import { loadOwnCheck } from "@/lib/check-action";

// Applying a rewrite saves its re-check as a new check, so the creator gets
// the score they were shown without spending another analysis.
export async function POST(request: Request) {
  try {
    const { userId, check } = await loadOwnCheck(await readJson(request, CheckActionRequest));
    const rewrite = check.rewrite;
    if (!rewrite?.after) throw new HttpError(409, "invalid_request", "This rewrite has no re-check to apply.");
    const draft = { ...check.draft, script: rewrite.script };
    const id = await saveCheck(userId, draft, rewrite.locale ?? check.locale, rewrite.after);
    return Response.json({ id, draft });
  } catch (err) {
    return errorResponse(err);
  }
}
