import { CRITERIA, RUBRIC, type Criterion } from "./rubric";

export type CriterionScores = Record<Criterion, number>;

// A weak hook caps the total: most viewers never reach the rest of the script.
export const HOOK_GATE = { maxHookScore: 2, cap: 60 };

export function computeTotal(scores: CriterionScores): number {
  let weighted = 0;
  for (const c of CRITERIA) {
    weighted += RUBRIC[c].weight * ((scores[c] - 1) / 4);
  }
  let total = Math.round(weighted * 100);
  if (scores.hook <= HOOK_GATE.maxHookScore) total = Math.min(total, HOOK_GATE.cap);
  return total;
}

export type Verdict = "rework" | "weak" | "solid" | "strong" | "excellent";

export function verdictFor(total: number): Verdict {
  if (total >= 90) return "excellent";
  if (total >= 75) return "strong";
  if (total >= 60) return "solid";
  if (total >= 40) return "weak";
  return "rework";
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  rework: "Needs a rework",
  weak: "Weak - fix before filming",
  solid: "Solid - a few fixes away",
  strong: "Strong",
  excellent: "Excellent",
};
