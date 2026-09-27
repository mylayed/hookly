import { rewriteAndVerify } from "@/lib/analyzer/analyze";
import { CheckActionRequest, errorResponse, readJson } from "@/lib/api";
import { saveExtras, type RewriteView } from "@/lib/checks";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { metered } from "@/lib/limits";
import { loadOwnCheck } from "@/lib/check-action";

// The rewrite and its re-check run back to back (see CALL_BUDGET_MS).
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await readJson(request, CheckActionRequest);
    const { userId, check, input } = await loadOwnCheck(body);
    const result = await metered("rewrite", userId, request, () => rewriteAndVerify(input, check.analysis));
    const rewrite: RewriteView = { ...result, locale: body.locale ?? DEFAULT_LOCALE };
    await saveExtras(check.id, { rewrite });
    return Response.json(rewrite);
  } catch (err) {
    return errorResponse(err);
  }
}
