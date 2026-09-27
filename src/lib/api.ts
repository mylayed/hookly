import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AnalyzerError } from "./analyzer/client";
import { PLATFORMS } from "./analyzer/config";
import { DEFAULT_LOCALE, LOCALE_INFO, LOCALES } from "./i18n/locales";

// Request validation and error mapping shared by the /api routes.

export const ScriptRequest = z.object({
  script: z.string().min(1).max(20_000),
  platform: z.enum(PLATFORMS),
  niche: z.string().max(80).optional(),
  pace: z.enum(["calm", "normal", "fast"]).optional(),
  // UI language; the model writes all feedback in it. The script itself can be in any language.
  locale: z.enum(LOCALES).optional(),
});

// Hooks and rewrites work on a saved check: the server loads the script and
// the analysis itself, so the client can't feed the models arbitrary input.
export const CheckActionRequest = z.object({
  checkId: z.uuid(),
  locale: z.enum(LOCALES).optional(),
});

export async function readJson<S extends z.ZodType>(request: Request, schema: S) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_request", "The request is missing a script or has an unknown platform.");
  }
  return parsed.data as z.infer<S>;
}

// Turns the request's locale into the analyzer's feedback language.
export function toScriptInput<T extends z.infer<typeof ScriptRequest>>({ locale, ...rest }: T) {
  const info = LOCALE_INFO[locale ?? DEFAULT_LOCALE];
  return { ...rest, feedbackLanguage: info.promptName, feedbackAddress: info.address };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public params: Record<string, number> = {},
  ) {
    super(message);
  }
}

// Errors carry a stable `code` (plus `params`) so the client can show them in
// the user's language; `error` stays as an English fallback.
function fail(status: number, code: string, error: string, params: Record<string, number> = {}) {
  return Response.json({ error, code, params }, { status });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return fail(err.status, err.code, err.message, err.params);
  if (err instanceof AnalyzerError) {
    const message =
      err.code === "refusal"
        ? "This script could not be analyzed. Edit any sensitive content and try again."
        : err.message;
    return fail(422, err.code, message, err.params);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return fail(429, "rate_limit", "Too many checks at once. Wait a few seconds and try again.");
  }
  console.error(err);
  return fail(502, "server", "The analysis service failed. Try again in a moment.");
}
