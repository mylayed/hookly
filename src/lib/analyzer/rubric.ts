// The scoring rubric. Each criterion is scored 1-5 against written anchors;
// the 0-100 total is computed in code (scoring.ts), never by the model.
// Every level has its own anchor: implied in-between levels made adjacent
// scores (3 vs 4) flip between runs.

export const CRITERIA = ["hook", "clarity", "pacing", "curiosity", "payoff"] as const;
export type Criterion = (typeof CRITERIA)[number];

export type Level = 1 | 2 | 3 | 4 | 5;

export interface CriterionSpec {
  label: string;
  question: string;
  weight: number; // weights sum to 1
  anchors: Record<Level, string>;
  examples: { 1: string; 3: string; 5: string };
}

export const RUBRIC: Record<Criterion, CriterionSpec> = {
  hook: {
    label: "Hook",
    question:
      "Do the first ~3 seconds (roughly the first 8 spoken words) give a specific reason to keep watching?",
    weight: 0.3,
    anchors: {
      1: "Opens with a greeting, self-introduction, 'in this video' or context-setting. Nothing is promised or at stake.",
      2: "States the topic in the first sentence, but as a plain label or generic statement ('Here are some tips for X'). No tension, no specific promise.",
      3: "There is a promise or question, but it is vague or overused ('You won't believe...', 'This changed my life'), or the real tension only arrives after the 3-second mark.",
      4: "A clear, specific promise or tension in the first sentence, but one thing holds it back: it runs past ~3 seconds, the stakes are abstract rather than concrete, or the phrasing is familiar.",
      5: "All of: specific (a number, named thing, visible stake or concrete outcome); speakable in under 3 seconds; creates a question the viewer needs answered; the script honestly delivers on it. If any one is missing, score 4.",
    },
    examples: {
      1: "\"Hey guys, welcome back to my channel! Today I want to talk a little bit about saving money.\"",
      3: "\"You won't believe how much money I saved on groceries.\"",
      5: "\"I cut my grocery bill from $600 to $310 without clipping a single coupon.\"",
    },
  },
  clarity: {
    label: "Clarity",
    question:
      "Can a distracted viewer understand every line on first listen, with no rewinding?",
    weight: 0.15,
    anchors: {
      1: "The main point cannot be stated in one sentence, or several lines are confusing (undefined jargon, long nested sentences, unclear references).",
      2: "The main point is recoverable, but at least two lines need re-listening or rely on jargon the audience may not know.",
      3: "Understandable overall, but one or two lines are wordy, abstract or ambiguous ('this', 'that thing' without a clear referent).",
      4: "Every line is understandable on first listen; a few are longer or more abstract than they need to be.",
      5: "Every line is short, concrete and natural when spoken aloud, one idea per sentence, and the core message fits in one sentence. If any line is abstract where a concrete example was possible, score 4.",
    },
    examples: {
      1: "\"The thing about this is that when you leverage the compounding effect of the aforementioned strategy it basically optimizes everything.\"",
      3: "\"Compound interest is basically when your returns start making their own returns over a long period.\"",
      5: "\"Put in $100. Next year it earns $7. The year after, that $7 earns too.\"",
    },
  },
  pacing: {
    label: "Pacing",
    question:
      "Does every line move the video forward, with no filler, repetition or slow stretch?",
    weight: 0.15,
    anchors: {
      1: "Large parts are setup, repetition, filler or tangents. The content would fit in half the length or less.",
      2: "Several lines (three or more) could be cut without losing anything, or there is a long slow stretch.",
      3: "One or two lines could be cut without loss (a redundant sentence, an over-explained step), or a list drags.",
      4: "Brisk; at most one line is slightly slow or could be tightened, but nothing is pure filler.",
      5: "Every line adds new information or raises tension; no line can be removed without losing something, and length fits the content. If you can name one line to cut, score 4.",
    },
    examples: {
      1: "\"So, yeah. Anyway. Like I said before, this is really important, it's super important, so let's get into it.\"",
      3: "\"Step one is prep. Prep is important. Here is why prep is important: it saves time.\"",
      5: "\"Step one: prep on Sunday. Twenty minutes, five lunches, zero decisions on a Tuesday.\"",
    },
  },
  curiosity: {
    label: "Retention",
    question:
      "After the hook, does the script keep an open loop or rising stakes so the viewer needs the next line?",
    weight: 0.25,
    anchors: {
      1: "No open question at all, or the hook's question is answered in the first few seconds. Nothing pulls the viewer to the end.",
      2: "A question exists but is answered early (before roughly the last third), and what follows is extra material with no new pull.",
      3: "The main question is held until near the end, but the middle is flat: items or steps follow each other with no escalation, mini-reveal or re-hook.",
      4: "The main question is held to the end and there is at least one explicit re-hook or escalation in the middle ('but that's not the weird part'), yet some stretch of 10+ seconds has no new pull.",
      5: "The main loop stays open until the payoff and there is new pull (escalation, mini-reveal, re-hook) at least every ~10 seconds, with the strongest point saved for last. If any 10-second stretch has no pull, score 4.",
    },
    examples: {
      1: "\"The secret is to use cold water. Anyway, here's some more about laundry.\"",
      3: "\"There are three reasons. The first is... the second is... the third is...\" (no escalation between them)",
      5: "\"The first two reasons are what everyone says. The third one is why my shirts last five years.\"",
    },
  },
  payoff: {
    label: "Payoff & CTA",
    question:
      "Does the ending deliver what the hook promised, land cleanly and give the viewer a reason to act (follow, comment, rewatch)?",
    weight: 0.15,
    anchors: {
      1: "The ending fizzles or trails off ('so yeah', 'anyway'), or the hook's promise is never delivered.",
      2: "The promise is only partly delivered, or the ending is a bare generic 'like and subscribe' with nothing tying it to the content.",
      3: "The promise is delivered, but the ending is flat, overlong, or closes with a generic CTA ('follow for more').",
      4: "The promise is delivered clearly and the video ends promptly; the CTA is present but generic, or it is content-specific but the last line lacks punch.",
      5: "Delivers the promised outcome memorably, ends right after the payoff, and any CTA grows out of the content (a specific comment prompt, a part-2 tease, a loop back to the start). If the CTA is generic, score 4.",
    },
    examples: {
      1: "\"So yeah, that's pretty much it. Like and subscribe, see you next time!\"",
      3: "\"And that's how I saved $290 a month. Follow for more tips.\"",
      5: "\"$290 a month. That's a flight to Lisbon every quarter. Comment your grocery bill and I'll tell you where it's leaking.\"",
    },
  },
};

// Sentence-level risk taxonomy for the drop-off map.
export const RISK_ISSUES = [
  "none",
  "slow_start",
  "generic_opening",
  "confusing",
  "filler",
  "redundant",
  "tension_drop",
  "answered_too_early",
  "weak_transition",
  "overpromise",
  "weak_ending",
  "generic_cta",
] as const;
export type RiskIssue = (typeof RISK_ISSUES)[number];

export const HOOK_TYPES = [
  "bold_claim",
  "specific_result",
  "curiosity_gap",
  "contrarian",
  "relatable_pain",
  "mistake_warning",
  "story_in_media_res",
  "direct_question",
  "visual_pattern_interrupt",
] as const;
export type HookType = (typeof HOOK_TYPES)[number];

export function renderRubric(): string {
  const levels: Level[] = [1, 2, 3, 4, 5];
  return CRITERIA.map((c) => {
    const r = RUBRIC[c];
    return [
      `<criterion id="${c}" label="${r.label}">`,
      `Question: ${r.question}`,
      ...levels.map((l) => `Level ${l}: ${r.anchors[l]}`),
      `Example of a level-1 line: ${r.examples[1]}`,
      `Example of a level-3 line: ${r.examples[3]}`,
      `Example of a level-5 line: ${r.examples[5]}`,
      `</criterion>`,
    ].join("\n");
  }).join("\n\n");
}
