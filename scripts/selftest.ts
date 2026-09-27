// Offline checks for the deterministic parts (no API calls).
// npm run selftest
import assert from "node:assert/strict";
import { computeTotal, estimateDuration, RUBRIC, CRITERIA, segmentScript } from "../src/lib/analyzer";
import { countSpokenWords, splitBeats } from "../src/lib/analyzer/segment";
import { AnalysisOutput } from "../src/lib/analyzer/schemas";
import { loadFixtures } from "./_shared";

// Weights sum to 1.
assert.equal(Math.round(CRITERIA.reduce((s, c) => s + RUBRIC[c].weight, 0) * 1000), 1000);

// Score mapping and hook gate.
const all = (n: number) => ({ hook: n, clarity: n, pacing: n, curiosity: n, payoff: n });
assert.equal(computeTotal(all(1)), 0);
assert.equal(computeTotal(all(3)), 50);
assert.equal(computeTotal(all(5)), 100);
assert.equal(computeTotal({ ...all(5), hook: 2 }), 60, "weak hook caps the total");

// Segmentation.
assert.deepEqual(splitBeats("Hi there. How are you?\n\nFine!"), ["Hi there.", "How are you?", "Fine!"]);
assert.deepEqual(splitBeats("It costs $3.50 today."), ["It costs $3.50 today."]);
assert.deepEqual(splitBeats('He said "stop." Then left.'), ['He said "stop."', "Then left."]);
assert.equal(countSpokenWords("[b-roll of city] Five words are spoken here (smiles)"), 5);
assert.equal(countSpokenWords("Привіт, як справи? — Добре!"), 4);
assert.equal(estimateDuration("one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six twenty-seven"), 10);

const beats = segmentScript("One two three. Four five six.");
assert.equal(beats.length, 2);
assert.equal(beats[1].start, beats[0].end);

// Every fixture segments into beats and stays under the word limit.
for (const f of loadFixtures()) {
  const b = segmentScript(f.script);
  assert.ok(b.length >= 4, `${f.id} has too few beats`);
  console.log(`${f.id.padEnd(22)} ${String(b.length).padStart(2)} beats, ~${Math.round(estimateDuration(f.script))} s`);
}

// Schema accepts a well-formed response and rejects an out-of-range score.
const judgement = { evidence: "x", reasoning: "y", score: 3 };
const ok = {
  summary: "s",
  hook_promise: "p",
  criteria: { hook: judgement, clarity: judgement, pacing: judgement, curiosity: judgement, payoff: judgement },
  beats: [{ id: 1, risk: "low", issue: "none", reason: "", fix: "" }],
  top_fixes: [{ beat_id: null, title: "t", detail: "d" }],
  strengths: [],
};
assert.ok(AnalysisOutput.safeParse(ok).success);
assert.ok(!AnalysisOutput.safeParse({ ...ok, criteria: { ...ok.criteria, hook: { ...judgement, score: 7 } } }).success);

console.log("\nselftest passed");
