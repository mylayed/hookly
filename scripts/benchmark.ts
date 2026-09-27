// Score every fixture once and check it lands in its expected band and that
// better scripts outrank worse ones.
// npm run benchmark [-- --only id1,id2]
import { mkdirSync, writeFileSync } from "node:fs";
import { arg, BAND_RANGE, loadFixtures, pool, usd, type Band } from "./_shared";
import { analyzeScript, CRITERIA } from "../src/lib/analyzer";

const fixtures = loadFixtures(arg("only")?.split(","));
const RANK: Record<Band, number> = { weak: 0, ok: 1, strong: 2 };

const results = await pool(fixtures, 3, async (f) => {
  const a = await analyzeScript({ script: f.script, platform: f.platform, niche: f.niche });
  const [lo, hi] = BAND_RANGE[f.band];
  const inBand = a.total >= lo && a.total <= hi;
  console.log(
    `${inBand ? "PASS" : "FAIL"}  ${f.id.padEnd(22)} ${String(a.total).padStart(3)}  expected ${f.band} (${lo}-${hi})  ` +
      CRITERIA.map((c) => `${c[0].toUpperCase()}${a.scores[c]}`).join(" "),
  );
  return { id: f.id, band: f.band, total: a.total, scores: a.scores, inBand, cost: a.usage.costUsd, usage: a.usage };
});

// Pairwise ordering: for every pair with different bands, is the better one scored higher?
let pairs = 0;
let correct = 0;
for (const x of results) {
  for (const y of results) {
    if (RANK[x.band] > RANK[y.band]) {
      pairs++;
      if (x.total > y.total) correct++;
    }
  }
}

const passed = results.filter((r) => r.inBand).length;
const cost = results.reduce((s, r) => s + r.cost, 0);
console.log(`\nIn band:  ${passed}/${results.length}`);
console.log(`Ordering: ${correct}/${pairs} pairs (${pairs ? Math.round((100 * correct) / pairs) : 0}%)`);
console.log(`Cost:     ${usd(cost)} total, ${usd(cost / results.length)} per analysis`);

mkdirSync("benchmarks/results", { recursive: true });
const out = `benchmarks/results/benchmark-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(out, JSON.stringify({ passed, total: results.length, correct, pairs, cost, results }, null, 2));
console.log(`Saved ${out}`);
