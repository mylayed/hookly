import "server-only";
import { HttpError, toScriptInput } from "./api";
import { getCheck } from "./checks";
import type { Locale } from "./i18n/locales";
import { currentUserId, userClient } from "./supabase";

// Shared start of /api/hooks and /api/rewrite: load the visitor's saved check
// and turn it back into analyzer input, with feedback in the current UI language.
export async function loadOwnCheck({ checkId, locale }: { checkId: string; locale?: Locale }) {
  const db = await userClient();
  const userId = await currentUserId(db);
  if (!userId) throw new HttpError(404, "not_found", "This check no longer exists.");
  const check = await getCheck(db, checkId);
  const { script, platform, niche, pace } = check.draft;
  const input = toScriptInput({ script, platform, niche: niche || undefined, pace, locale });
  return { userId, check, input };
}
