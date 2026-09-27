// Central knobs for the analyzer. Everything tunable lives here so the
// benchmark/stability scripts and the app share one source of truth.

export const MODELS = {
  // Fast, cheap first pass: scoring + risk map + hooks.
  analyze: process.env.HOOKCHECK_ANALYZE_MODEL ?? "claude-sonnet-5",
  // Stronger model for rewriting in the author's voice.
  rewrite: process.env.HOOKCHECK_REWRITE_MODEL ?? "claude-opus-5",
} as const;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export const EFFORT: Record<"analyze" | "hooks" | "rewrite", Effort> = {
  analyze: (process.env.HOOKCHECK_ANALYZE_EFFORT as Effort) ?? "medium",
  hooks: (process.env.HOOKCHECK_HOOKS_EFFORT as Effort) ?? "medium",
  rewrite: (process.env.HOOKCHECK_REWRITE_EFFORT as Effort) ?? "medium",
};

// USD per 1M tokens. Used only for cost reporting; update if pricing changes.
export const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export const PLATFORMS = ["youtube_shorts", "instagram_reels", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube_shorts: "YouTube Shorts",
  instagram_reels: "Instagram Reels",
  tiktok: "TikTok",
};

// Caps cost per check; a 3-minute Short is ~500 words.
export const MAX_SCRIPT_WORDS = 1200;

// Voiceover pace in spoken words per second.
export const PACE_WPS = { calm: 2.3, normal: 2.7, fast: 3.2 } as const;
export type Pace = keyof typeof PACE_WPS;

// Sweet-spot length used as context for the model (not a hard rule).
export const IDEAL_SECONDS: Record<Platform, [number, number]> = {
  youtube_shorts: [20, 50],
  instagram_reels: [15, 45],
  tiktok: [15, 60],
};
