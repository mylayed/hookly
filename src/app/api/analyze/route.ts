import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeScript, type ReviewBase } from "@/lib/analyzer/analyze";
import { errorResponse, readJson, ScriptRequest, toScriptInput } from "@/lib/api";
import { getCheck, saveCheck } from "@/lib/checks";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { metered } from "@/lib/limits";
import { requireUserId, userClient } from "@/lib/supabase";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { baseCheckId, ...body } = await readJson(request, ScriptRequest);
    const db = await userClient();
    const userId = await requireUserId(db);
    const base = baseCheckId ? await reviewBase(db, baseCheckId, body.platform) : undefined;
    const analysis = await metered("analyze", userId, request, () => analyzeScript(toScriptInput(body), base));
    const draft = { script: body.script, platform: body.platform, niche: body.niche ?? "", pace: body.pace ?? "normal" };
    const id = await saveCheck(userId, draft, body.locale ?? DEFAULT_LOCALE, analysis);
    return Response.json({ id, analysis });
  } catch (err) {
    return errorResponse(err);
  }
}

// A base check that's gone, someone else's, or for another platform just
// means a fresh review.
async function reviewBase(db: SupabaseClient, id: string, platform: string): Promise<ReviewBase | undefined> {
  try {
    const check = await getCheck(db, id);
    return check.draft.platform === platform ? { analysis: check.analysis } : undefined;
  } catch {
    return undefined;
  }
}
