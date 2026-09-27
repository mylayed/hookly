import { analyzeScript } from "@/lib/analyzer/analyze";
import { errorResponse, readJson, ScriptRequest, toScriptInput } from "@/lib/api";
import { saveCheck } from "@/lib/checks";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { metered } from "@/lib/limits";
import { requireUserId, userClient } from "@/lib/supabase";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await readJson(request, ScriptRequest);
    const userId = await requireUserId(await userClient());
    const analysis = await metered("analyze", userId, request, () => analyzeScript(toScriptInput(body)));
    const draft = { script: body.script, platform: body.platform, niche: body.niche ?? "", pace: body.pace ?? "normal" };
    const id = await saveCheck(userId, draft, body.locale ?? DEFAULT_LOCALE, analysis);
    return Response.json({ id, analysis });
  } catch (err) {
    return errorResponse(err);
  }
}
