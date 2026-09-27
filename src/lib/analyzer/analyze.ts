import { CALL_BUDGET_MS, EFFORT, MAX_SCRIPT_WORDS, MODELS, type Pace, type Platform } from "./config";
import { AnalyzerError, callStructured, type CallUsage } from "./client";
import {
  ANALYZE_SYSTEM,
  HOOKS_SYSTEM,
  REWRITE_SYSTEM,
  renderBeats,
  renderContext,
  renderLanguageRule,
  renderPreviousReview,
  renderWhatWorks,
  type ScriptContext,
} from "./prompts";
import { CRITERIA, type Criterion, type HookType, type RiskIssue } from "./rubric";
import { AnalysisOutput, HooksOutput, RewriteOutput } from "./schemas";
import { computeTotal, verdictFor, type CriterionScores, type Verdict } from "./scoring";
import { countSpokenWords, estimateDuration, segmentScript, type Beat } from "./segment";

export interface ScriptInput {
  script: string;
  platform: Platform;
  niche?: string;
  pace?: Pace;
  feedbackLanguage?: string;
  // How to address the creator in feedback, e.g. "formal «ви»". Optional.
  feedbackAddress?: string;
}

export interface RiskBeat extends Beat {
  risk: "low" | "medium" | "high";
  issue: RiskIssue;
  reason: string;
  fix: string;
}

export interface Analysis {
  total: number;
  verdict: Verdict;
  scores: CriterionScores;
  criteria: AnalysisOutput["criteria"];
  summary: string;
  hookPromise: string;
  beats: RiskBeat[];
  topFixes: AnalysisOutput["top_fixes"];
  strengths: string[];
  wordCount: number;
  durationSeconds: number;
  // True when the model skipped some beats and we filled them in as low risk.
  incompleteMap: boolean;
  usage: CallUsage;
}

function prepare(input: ScriptInput) {
  const script = input.script.trim();
  if (!script) throw new AnalyzerError("empty", "The script is empty.");
  const wordCount = countSpokenWords(script);
  if (wordCount > MAX_SCRIPT_WORDS) {
    throw new AnalyzerError(
      "too_long",
      `Scripts are limited to ${MAX_SCRIPT_WORDS} spoken words (this one has ${wordCount}).`,
      { limit: MAX_SCRIPT_WORDS, count: wordCount },
    );
  }
  const pace = input.pace ?? "normal";
  const beats = segmentScript(script, pace);
  const ctx: ScriptContext = {
    platform: input.platform,
    niche: input.niche,
    feedbackLanguage: input.feedbackLanguage ?? "English",
    feedbackAddress: input.feedbackAddress,
  };
  const durationSeconds = estimateDuration(script, pace);
  return { beats, ctx, wordCount, durationSeconds };
}

// The review of the version a script was edited from. A re-check is anchored
// to it, so the score moves because of the edits, not because the model read
// the untouched lines differently this time.
export interface ReviewBase {
  analysis: Pick<Analysis, "criteria" | "beats">;
}

const normalize = (s: string) => s.replace(/\s+/g, " ").trim();

function previousReview(beats: Beat[], base: ReviewBase): string {
  const before = new Map<string, RiskBeat>();
  for (const b of base.analysis.beats) {
    if (!before.has(normalize(b.text))) before.set(normalize(b.text), b);
  }
  const kept: { id: number; risk: string; issue: string }[] = [];
  const changed: number[] = [];
  const now = new Set<string>();
  for (const b of beats) {
    const key = normalize(b.text);
    now.add(key);
    const prev = before.get(key);
    if (prev) kept.push({ id: b.id, risk: prev.risk, issue: prev.issue });
    else changed.push(b.id);
  }
  // Mostly rewritten: it's a new script, review it fresh.
  if (kept.length < beats.length / 2) return "";
  const removed = [...before.keys()].filter((t) => !now.has(t));
  return renderPreviousReview({ criteria: base.analysis.criteria, kept, changed, removed });
}

export async function analyzeScript(input: ScriptInput, base?: ReviewBase): Promise<Analysis> {
  const { beats, ctx, wordCount, durationSeconds } = prepare(input);
  const anchor = base ? previousReview(beats, base) : "";

  const user = `${renderContext(ctx, durationSeconds)}
${anchor ? `\n${anchor}\n` : ""}
<script>
${renderBeats(beats)}
</script>

${renderLanguageRule(ctx, "summary, hook_promise, reasoning, reason, fix, top_fixes and strengths")}`;

  const { data, usage } = await callStructured({
    model: MODELS.analyze,
    effort: EFFORT.analyze,
    system: ANALYZE_SYSTEM,
    user,
    schema: AnalysisOutput,
    budgetMs: CALL_BUDGET_MS.analyze,
  });

  const byId = new Map(data.beats.map((b) => [b.id, b]));
  const riskBeats: RiskBeat[] = beats.map((b) => {
    const r = byId.get(b.id);
    return r
      ? { ...b, risk: r.risk, issue: r.issue, reason: r.reason, fix: r.fix }
      : { ...b, risk: "low", issue: "none", reason: "", fix: "" };
  });

  const scores = Object.fromEntries(
    CRITERIA.map((c) => [c, data.criteria[c].score]),
  ) as Record<Criterion, number>;
  const total = computeTotal(scores);

  return {
    total,
    verdict: verdictFor(total),
    scores,
    criteria: data.criteria,
    summary: data.summary,
    hookPromise: data.hook_promise,
    beats: riskBeats,
    topFixes: data.top_fixes.slice(0, 3),
    strengths: data.strengths.slice(0, 3),
    wordCount,
    durationSeconds,
    incompleteMap: beats.some((b) => !byId.has(b.id)),
    usage,
  };
}

export interface Hook {
  type: HookType;
  spoken: string;
  onScreenText: string;
  visual: string;
  whyItWorks: string;
  seconds: number;
}

export async function generateHooks(
  input: ScriptInput,
  analysis?: { summary: string; criteria: { hook: { reasoning: string } } },
): Promise<{ hooks: Hook[]; usage: CallUsage }> {
  const { beats, ctx, durationSeconds } = prepare(input);
  const diagnosis = analysis
    ? `\nWhat is wrong with the current hook: ${analysis.criteria.hook.reasoning}\nWhat the video is about: ${analysis.summary}\n`
    : "";

  const user = `${renderContext(ctx, durationSeconds)}
${diagnosis}
Write 5 alternative hooks for this script.

<script>
${renderBeats(beats)}
</script>

${renderLanguageRule(ctx, "visual and why_it_works")} "spoken" and "on_screen_text" stay in the script's language.`;

  const { data, usage } = await callStructured({
    model: MODELS.analyze,
    effort: EFFORT.hooks,
    system: HOOKS_SYSTEM,
    user,
    schema: HooksOutput,
    budgetMs: CALL_BUDGET_MS.hooks,
  });

  const hooks = data.hooks.slice(0, 5).map((h) => ({
    type: h.type,
    spoken: h.spoken,
    onScreenText: h.on_screen_text,
    visual: h.visual,
    whyItWorks: h.why_it_works,
    seconds: estimateDuration(h.spoken, input.pace ?? "normal"),
  }));
  return { hooks, usage };
}

export interface Rewrite {
  voiceNotes: string;
  edits: { beatId: number; original: string; rewritten: string; changeNote: string }[];
  script: string;
  durationSeconds: number;
  usage: CallUsage;
}

export type RewriteBasis = Pick<Analysis, "beats" | "hookPromise" | "durationSeconds" | "criteria" | "strengths">;

export async function rewriteWeakSpots(input: ScriptInput, analysis: RewriteBasis): Promise<Rewrite> {
  const { ctx } = prepare(input);
  const targets = analysis.beats.filter((b) => b.risk !== "low");
  if (targets.length === 0) {
    return {
      voiceNotes: "",
      edits: [],
      script: input.script.trim(),
      durationSeconds: analysis.durationSeconds,
      usage: { model: MODELS.rewrite, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 },
    };
  }

  const problems = targets
    .map((b) => `- Beat ${b.id} (${b.risk} risk, ${b.issue}): ${b.reason}${b.fix ? ` Suggested direction: ${b.fix}` : ""}`)
    .join("\n");

  const user = `${renderContext(ctx, analysis.durationSeconds)}
What the video promises: ${analysis.hookPromise || "(no clear promise yet)"}

${renderWhatWorks(analysis.criteria, analysis.strengths)}

Beats to fix (edit only these ids; leave out any you can't improve safely):
${problems}

<script>
${renderBeats(analysis.beats)}
</script>

${renderLanguageRule(ctx, "voice_notes and change_note")} Every "rewritten" line stays in the script's language.`;

  const { data, usage } = await callStructured({
    model: MODELS.rewrite,
    effort: EFFORT.rewrite,
    system: REWRITE_SYSTEM,
    user,
    schema: RewriteOutput,
    budgetMs: CALL_BUDGET_MS.rewrite,
  });

  const allowed = new Set(targets.map((b) => b.id));
  const replacement = new Map<number, string>();
  const edits: Rewrite["edits"] = [];
  for (const e of data.edits) {
    if (!allowed.has(e.beat_id) || replacement.has(e.beat_id)) continue;
    const original = analysis.beats.find((b) => b.id === e.beat_id)!.text;
    replacement.set(e.beat_id, e.rewritten.trim());
    edits.push({ beatId: e.beat_id, original, rewritten: e.rewritten.trim(), changeNote: e.change_note });
  }

  const script = rebuild(analysis.beats, replacement);
  return {
    voiceNotes: data.voice_notes,
    edits,
    script,
    durationSeconds: estimateDuration(script, input.pace ?? "normal"),
    usage,
  };
}

export interface VerifiedRewrite extends Rewrite {
  // The rewritten script re-checked against the review it was made from, so
  // the creator sees whether it actually helps before applying it. Null when
  // nothing changed or the re-check didn't finish.
  after: Omit<Analysis, "usage"> | null;
}

export async function rewriteAndVerify(input: ScriptInput, analysis: RewriteBasis): Promise<VerifiedRewrite> {
  const rewrite = await rewriteWeakSpots(input, analysis);
  if (rewrite.edits.length === 0) return { ...rewrite, after: null };
  try {
    const { usage, ...after } = await analyzeScript({ ...input, script: rewrite.script }, { analysis });
    return { ...rewrite, after, usage: addUsage(rewrite.usage, usage) };
  } catch (err) {
    // The rewrite is already paid for; return it without the re-check.
    console.warn("[rewrite] could not re-check the rewrite:", err);
    return { ...rewrite, after: null };
  }
}

function addUsage(a: CallUsage, b: CallUsage): CallUsage {
  return {
    model: `${a.model} + ${b.model}`,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    costUsd: a.costUsd + b.costUsd,
  };
}

// Reassemble the script one beat per line, dropping cut beats.
function rebuild(beats: Beat[], replacement: Map<number, string>): string {
  return beats
    .map((b) => (replacement.has(b.id) ? replacement.get(b.id)! : b.text))
    .filter((t) => t.length > 0)
    .join("\n");
}
