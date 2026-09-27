import { z } from "zod";
import { HOOK_TYPES, RISK_ISSUES } from "./rubric";

// Field order matters: the model writes evidence and reasoning before the
// score, which makes scores more grounded and more repeatable.
const CriterionJudgement = z.object({
  evidence: z
    .string()
    .describe("Short exact quote(s) from the script that decide this score."),
  reasoning: z
    .string()
    .describe(
      "One or two plain sentences for the creator explaining the score. Decide the score by the anchors, but never mention levels or the rubric here.",
    ),
  score: z.number().int().min(1).max(5),
});

export const AnalysisOutput = z.object({
  summary: z.string().describe("One sentence: what the video is about."),
  hook_promise: z
    .string()
    .describe("What the opening promises the viewer, in one sentence. Empty string if nothing."),
  criteria: z.object({
    hook: CriterionJudgement,
    clarity: CriterionJudgement,
    pacing: CriterionJudgement,
    curiosity: CriterionJudgement,
    payoff: CriterionJudgement,
  }),
  beats: z
    .array(
      z.object({
        id: z.number().int(),
        risk: z.enum(["low", "medium", "high"]),
        issue: z.enum(RISK_ISSUES),
        reason: z.string().describe("Why a viewer might swipe here. Empty string if risk is low."),
        fix: z.string().describe("A concrete edit for this line. Empty string if risk is low."),
      }),
    )
    .describe("Exactly one entry per beat id, in order."),
  top_fixes: z
    .array(
      z.object({
        beat_id: z.number().int().nullable(),
        title: z.string(),
        detail: z.string(),
      }),
    )
    .describe("The 3 edits with the biggest expected impact, most important first."),
  strengths: z.array(z.string()).describe("Up to 3 things the script already does well."),
});
export type AnalysisOutput = z.infer<typeof AnalysisOutput>;

export const HooksOutput = z.object({
  hooks: z.array(
    z.object({
      type: z.enum(HOOK_TYPES),
      spoken: z.string().describe("The exact words spoken. Speakable in about 3 seconds."),
      on_screen_text: z.string().describe("Short text overlay for the first frame. Empty string if none."),
      visual: z.string().describe("What is on screen in the first second."),
      why_it_works: z.string(),
    }),
  ),
});
export type HooksOutput = z.infer<typeof HooksOutput>;

export const RewriteOutput = z.object({
  voice_notes: z
    .string()
    .describe("How the author writes (person, tone, slang, sentence length) - the style to preserve."),
  edits: z.array(
    z.object({
      beat_id: z.number().int(),
      rewritten: z.string().describe("Replacement text for this beat. Empty string means cut the beat."),
      change_note: z.string().describe("What changed and why, in one sentence."),
    }),
  ),
});
export type RewriteOutput = z.infer<typeof RewriteOutput>;
