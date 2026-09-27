"use client";

import { CheckCircle } from "@phosphor-icons/react";
import { CRITERIA } from "@/lib/analyzer/rubric";
import { useI18n } from "./i18n";
import { levelTone, type AnalysisView } from "./shared";

const PIP_TONE = { low: "bg-low", mid: "bg-mid", high: "bg-high" } as const;

export function ScorePanel({
  analysis,
  onSelectBeat,
}: {
  analysis: AnalysisView;
  onSelectBeat: (id: number) => void;
}) {
  const { m } = useI18n();
  return (
    <div>
      <section className="settle px-6 pb-6 pt-6" aria-labelledby="score-heading">
        <h2 id="score-heading" className="sr-only">
          {m.score.heading}
        </h2>
        <div className="flex items-end gap-3">
          <p className="font-display text-[72px] font-bold leading-[0.9] tracking-[-0.04em] tabular">{analysis.total}</p>
          <p className="pb-1.5 font-display text-lg font-medium text-faint">/100</p>
        </div>
        <p className="mt-4 text-[17px] font-medium">{m.verdicts[analysis.verdict]}</p>
        <p className="mt-1 max-w-[60ch] text-[15px] leading-relaxed text-muted">{analysis.summary}</p>
      </section>

      <section className="border-t border-line px-6 py-5" aria-labelledby="criteria-heading">
        <h3 id="criteria-heading" className="font-display text-[15px] font-medium tracking-[-0.01em]">
          {m.score.breakdown}
        </h3>
        <dl className="mt-3 divide-y divide-line">
          {CRITERIA.map((c, i) => {
            const score = analysis.scores[c];
            const tone = levelTone(score);
            return (
              <div key={c} className="settle py-3.5" style={{ ["--i" as string]: i + 1 }}>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-[15px] font-medium">{m.criteria[c]}</dt>
                  <dd className="flex items-center gap-3">
                    <span className="flex gap-1" aria-hidden>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span
                          key={n}
                          className={`h-2 w-5 rounded-full ${n <= score ? PIP_TONE[tone] : "bg-line"}`}
                        />
                      ))}
                    </span>
                    <span className="w-8 text-right font-mono text-[13px] text-muted tabular">{score}/5</span>
                  </dd>
                </div>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted">{analysis.criteria[c].reasoning}</dd>
              </div>
            );
          })}
        </dl>
      </section>

      {analysis.topFixes.length > 0 && (
        <section className="border-t border-line px-6 py-5" aria-labelledby="fixes-heading">
          <h3 id="fixes-heading" className="font-display text-[15px] font-medium tracking-[-0.01em]">
            {m.score.fixFirst}
          </h3>
          <ol className="mt-3 space-y-4">
            {analysis.topFixes.map((f, i) => (
              <li key={i} className="settle grid grid-cols-[1.75rem_minmax(0,1fr)]" style={{ ["--i" as string]: i + 6 }}>
                <span className="font-display text-[15px] font-medium text-accent tabular">{i + 1}</span>
                <div>
                  <p className="text-[15px] font-medium leading-snug">{f.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{f.detail}</p>
                  {f.beat_id !== null && (
                    <button
                      type="button"
                      onClick={() => onSelectBeat(f.beat_id!)}
                      className="mt-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline"
                    >
                      {m.score.showLine(f.beat_id)}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {analysis.strengths.length > 0 && (
        <section className="border-t border-line px-6 py-5" aria-labelledby="strengths-heading">
          <h3 id="strengths-heading" className="font-display text-[15px] font-medium tracking-[-0.01em]">
            {m.score.working}
          </h3>
          <ul className="mt-3 space-y-2.5">
            {analysis.strengths.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-muted">
                <CheckCircle size={18} weight="fill" className="mt-px shrink-0 text-low" aria-hidden />
                {s}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function ScoreSkeleton({ elapsed }: { elapsed: number }) {
  const { m } = useI18n();
  return (
    <div className="px-6 py-6" role="status" aria-live="polite">
      <div className="h-[64px] w-36 rounded-xl bg-surface-2" />
      <div className="mt-5 h-4 w-48 rounded bg-surface-2" />
      <div className="mt-2.5 h-4 w-full max-w-[42ch] rounded bg-surface-2" />
      <div className="mt-8 space-y-5">
        {CRITERIA.map((c) => (
          <div key={c}>
            <div className="flex justify-between">
              <div className="h-4 w-24 rounded bg-surface-2" />
              <div className="h-2 w-32 rounded-full bg-surface-2" />
            </div>
            <div className="mt-2.5 h-3 w-4/5 rounded bg-surface-2" />
          </div>
        ))}
      </div>
      <p className="mt-8 text-sm text-muted">
        {m.score.reading}
        <span className="ml-2 font-mono text-faint tabular">
          {elapsed} {m.common.seconds}
        </span>
      </p>
    </div>
  );
}
