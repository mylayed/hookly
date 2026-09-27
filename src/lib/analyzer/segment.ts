import { PACE_WPS, type Pace } from "./config";

export interface Beat {
  id: number;
  text: string;
  // Spoken words only; [bracketed] and (parenthesized) notes are visual directions.
  words: number;
  start: number; // seconds
  end: number; // seconds
}

const DIRECTION = /\[[^\]]*\]|\([^)]*\)/g;

export function countSpokenWords(text: string): number {
  const spoken = text.replace(DIRECTION, " ").trim();
  if (!spoken) return 0;
  return spoken.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

// Split into beats: one per sentence, never crossing a line break.
export function splitBeats(script: string): string[] {
  const out: string[] = [];
  for (const rawLine of script.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    // Split after . ! ? … (optionally followed by a closing quote in any of the
    // supported languages: " ' ” “ » « ›) + whitespace.
    const parts = line.split(/(?<=[.!?…]["'”“»«›)]?)\s+(?=\S)/u);
    for (const p of parts) {
      const t = p.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

export function segmentScript(script: string, pace: Pace = "normal"): Beat[] {
  const wps = PACE_WPS[pace];
  let t = 0;
  return splitBeats(script).map((text, i) => {
    const words = countSpokenWords(text);
    const start = t;
    t += words / wps;
    return { id: i + 1, text, words, start: round1(start), end: round1(t) };
  });
}

export function estimateDuration(script: string, pace: Pace = "normal"): number {
  return round1(countSpokenWords(script) / PACE_WPS[pace]);
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(1).padStart(4, "0");
  return `${m}:${rest}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
