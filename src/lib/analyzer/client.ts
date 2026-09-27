import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { PRICING, type Effort } from "./config";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export class AnalyzerError extends Error {
  constructor(
    public code: "refusal" | "truncated" | "invalid_output" | "empty" | "too_long",
    message: string,
    // Numbers the UI needs to rebuild the message in the user's language.
    public params: Record<string, number> = {},
  ) {
    super(message);
    this.name = "AnalyzerError";
  }
}

export interface CallUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

// Models that get server-side refusal fallbacks.
const FALLBACK_MODELS = new Set(["claude-opus-5"]);

export async function callStructured<S extends z.ZodType>(opts: {
  model: string;
  effort: Effort;
  system: string;
  user: string;
  schema: S;
  // Total wall-clock time this call may spend, including the SDK's own
  // retries and the schema retry below. Past it the call is aborted, so it
  // can't run into the route's maxDuration (which would get the function
  // killed before `metered` can release the usage reservation).
  budgetMs: number;
}): Promise<{ data: z.infer<S>; usage: CallUsage }> {
  const deadline = Date.now() + opts.budgetMs;
  // A per-request `timeout` alone isn't enough: the SDK retries timed-out
  // requests, each with a fresh timeout. The signal caps all attempts together.
  const signal = AbortSignal.timeout(opts.budgetMs);
  const fallback = FALLBACK_MODELS.has(opts.model)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};

  const request = (timeout: number) =>
    getClient().beta.messages.parse(
      {
        model: opts.model,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
        // Static system prompt first so it is served from the prompt cache.
        system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: opts.user }],
        ...fallback,
      },
      { timeout, signal },
    );

  // The SDK throws a plain AnthropicError when the output fails schema
  // validation (rare, e.g. an off-list enum value). Retry that once, but
  // only if there's enough of the budget left to make it worthwhile; API
  // errors (rate limits, 5xx) are already retried by the SDK itself.
  const MIN_RETRY_MS = 15_000;
  let response;
  try {
    response = await request(Math.max(opts.budgetMs - MIN_RETRY_MS, MIN_RETRY_MS));
  } catch (err) {
    if (err instanceof Anthropic.APIError || !(err instanceof Anthropic.AnthropicError)) throw err;
    const remaining = deadline - Date.now();
    if (remaining < MIN_RETRY_MS) {
      throw new AnalyzerError("invalid_output", "The model returned output that did not match the schema.");
    }
    try {
      response = await request(remaining);
    } catch (retryErr) {
      if (retryErr instanceof Anthropic.APIError) throw retryErr;
      throw new AnalyzerError("invalid_output", "The model returned output that did not match the schema.");
    }
  }

  if (response.stop_reason === "refusal") {
    throw new AnalyzerError("refusal", "The model declined to analyze this script.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new AnalyzerError("truncated", "The response was cut off before it finished.");
  }
  if (!response.parsed_output) {
    throw new AnalyzerError("invalid_output", "The model returned output that did not match the schema.");
  }

  return { data: response.parsed_output as z.infer<S>, usage: toUsage(response.model, response.usage) };
}

function toUsage(
  model: string,
  u: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  },
): CallUsage {
  const price = PRICING[model] ?? { input: 0, output: 0 };
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  // Cache writes bill at 1.25x input, reads at ~0.1x (5-minute cache).
  const costUsd =
    ((u.input_tokens + cacheWrite * 1.25 + cacheRead * 0.1) * price.input +
      u.output_tokens * price.output) /
    1_000_000;
  return {
    model,
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    costUsd,
  };
}
