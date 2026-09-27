// Run the same scripts several times and measure how much the scores move.
// npm run stability [-- --runs 5 --only id1,id2]
import { mkdirSync, writeFileSync } from "node:fs";
import { arg, loadFixtures, pool, usd } from "./_shared";
import { analyzeScript, CRITERIA, type Analysis } from "../src/lib/analyzer";

const runs = Number(arg("runs") ?? 5);
const fixtures = loadFixtures(arg("only")?.split(","));

const jobs = fixtures.flatMap((f) => Array.from({ length: runs }, () => f));
const analyses = await pool(jobs, 3, (f) =>
  analyzeScript({ script: f.script, platform: f.platform, niche: f.niche }),
);

const report = fixtures.map((f, fi) => {
  const as: Analysis[] = analyses.slice(fi * runs, (fi + 1) * runs);
  const totals = as.map((a) => a.total);
  const criteria = Object.fromEntries(
    CRITERIA.map((c) => [c, spread(as.map((a) => a.scores[c]))]),
  );
  // Beat agreement: share of beats where every run gave the same risk level.
  const beatCount = as[0].beats.length;
  let agreed = 0;
  for (let i = 0; i < beatCount; i++) {
    if (new Set(as.map((a) => a.beats[i].risk)).size === 1) agreed++;
  }
  const row = {
    id: f.id,
    totals,
    total: spread(totals),
    criteria,
    beatAgreement: agreed / beatCount,
    cost: as.reduce((s, a) => s + a.usage.costUsd, 0),
  };
  console.log(
    `${f.id.padEnd(22)} totals ${totals.join(",").padEnd(22)} range ${row.total.range} sd ${row.total.sd.toFixed(1)}  ` +
      `beats agree ${Math.round(row.beatAgreement * 100)}%  ` +
      CRITERIA.map((c) => `${c[0].toUpperCase()}:${criteria[c].values.join("")}`).join(" "),
  );
  return row;
});

const maxRange = Math.max(...report.map((r) => r.total.range));
const meanSd = report.reduce((s, r) => s + r.total.sd, 0) / report.length;
const meanAgree = report.reduce((s, r) => s + r.beatAgreement, 0) / report.length;
const cost = report.reduce((s, r) => s + r.cost, 0);
console.log(`\nWorst total range: ${maxRange} points (target: <= 10)`);
console.log(`Mean total SD:     ${meanSd.toFixed(1)} (target: <= 4)`);
console.log(`Beat agreement:    ${Math.round(meanAgree * 100)}% (target: >= 70%)`);
console.log(`Cost:              ${usd(cost)}`);

mkdirSync("benchmarks/results", { recursive: true });
const out = `benchmarks/results/stability-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(out, JSON.stringify({ runs, maxRange, meanSd, meanAgree, cost, report }, null, 2));
console.log(`Saved ${out}`);

function spread(values: number[]) {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  return { values, mean, sd, range: Math.max(...values) - Math.min(...values) };
}
