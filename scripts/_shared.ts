import { existsSync, readFileSync } from "node:fs";
import type { Platform } from "../src/lib/analyzer/config";

// Load ANTHROPIC_API_KEY etc. from .env.local, like Next.js does for the app.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export type Band = "weak" | "ok" | "strong";

export interface Fixture {
  id: string;
  source: "synthetic" | "real";
  band: Band;
  platform: Platform;
  niche?: string;
  script: string;
}

export const BAND_RANGE: Record<Band, [number, number]> = {
  weak: [0, 45],
  ok: [35, 70],
  strong: [65, 100],
};

export function loadFixtures(only?: string[]): Fixture[] {
  const all: Fixture[] = JSON.parse(readFileSync("benchmarks/fixtures.json", "utf8")).fixtures;
  return only?.length ? all.filter((f) => only.includes(f.id)) : all;
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

// Run tasks with a small concurrency limit to stay under rate limits.
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

export const usd = (n: number) => `$${n.toFixed(4)}`;
