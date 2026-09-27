// Analyze one script from a text file and print the report.
// npm run analyze -- path/to/script.txt --platform tiktok --niche "cooking" [--hooks] [--rewrite]
import { readFileSync } from "node:fs";
import { arg, flag, usd } from "./_shared";
import {
  analyzeScript,
  CRITERIA,
  formatTime,
  generateHooks,
  PLATFORMS,
  RUBRIC,
  rewriteWeakSpots,
  VERDICT_LABEL,
  type Platform,
  type ScriptInput,
} from "../src/lib/analyzer";

const file = process.argv[2];
if (!file || file.startsWith("--")) {
  console.error("Usage: npm run analyze -- <script.txt> [--platform youtube_shorts|instagram_reels|tiktok] [--niche text] [--lang English] [--hooks] [--rewrite]");
  process.exit(1);
}
const platform = (arg("platform") ?? "youtube_shorts") as Platform;
if (!PLATFORMS.includes(platform)) throw new Error(`Unknown platform: ${platform}`);

const input: ScriptInput = {
  script: readFileSync(file, "utf8"),
  platform,
  niche: arg("niche"),
  feedbackLanguage: arg("lang") ?? "English",
};

const RISK_MARK = { low: "🟢", medium: "🟡", high: "🔴" } as const;

const a = await analyzeScript(input);
console.log(`\n${a.total}/100 - ${VERDICT_LABEL[a.verdict]}`);
console.log(`${a.summary}\n${a.wordCount} words, ~${Math.round(a.durationSeconds)} s\n`);
for (const c of CRITERIA) {
  console.log(`${RUBRIC[c].label.padEnd(14)} ${a.scores[c]}/5  ${a.criteria[c].reasoning}`);
}
console.log("\nDrop-off map:");
for (const b of a.beats) {
  console.log(`${RISK_MARK[b.risk]} ${formatTime(b.start)} [${b.id}] ${b.text}`);
  if (b.risk !== "low") console.log(`      ${b.issue}: ${b.reason}\n      fix: ${b.fix}`);
}
if (a.incompleteMap) console.log("(warning: some beats were missing from the model output)");
console.log("\nTop fixes:");
a.topFixes.forEach((f, i) => console.log(`${i + 1}. ${f.title}${f.beat_id ? ` (beat ${f.beat_id})` : ""} - ${f.detail}`));
console.log("\nStrengths:");
a.strengths.forEach((s) => console.log(`+ ${s}`));
let cost = a.usage.costUsd;

if (flag("hooks")) {
  const { hooks, usage } = await generateHooks(input, a);
  cost += usage.costUsd;
  console.log("\nAlternative hooks:");
  hooks.forEach((h, i) => console.log(`${i + 1}. [${h.type}, ${h.seconds}s] "${h.spoken}"\n   visual: ${h.visual}${h.onScreenText ? ` | text: ${h.onScreenText}` : ""}\n   ${h.whyItWorks}`));
}

if (flag("rewrite")) {
  const r = await rewriteWeakSpots(input, a);
  cost += r.usage.costUsd;
  console.log(`\nRewrite (voice: ${r.voiceNotes})`);
  for (const e of r.edits) console.log(`[${e.beatId}] - ${e.original}\n     + ${e.rewritten || "(cut)"}\n     ${e.changeNote}`);
  console.log(`\nNew script (~${Math.round(r.durationSeconds)} s):\n${r.script}`);
}

console.log(`\nCost: ${usd(cost)} (analysis ${usd(a.usage.costUsd)}, ${a.usage.inputTokens}+${a.usage.cacheReadTokens} cached in / ${a.usage.outputTokens} out)`);
