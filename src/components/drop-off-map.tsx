"use client";

import { PencilSimple, Wrench } from "@phosphor-icons/react";
import { formatTime } from "@/lib/analyzer/segment";
import { useI18n } from "./i18n";
import type { RiskBeat } from "./shared";

const HOOK_ZONE = 3;

const SEGMENT_TONE: Record<RiskBeat["risk"], string> = {
  low: "bg-low/75",
  medium: "bg-mid",
  high: "bg-high",
};

const MARK_TONE: Record<RiskBeat["risk"], string> = {
  low: "",
  medium: "bg-mid-soft decoration-mid",
  high: "bg-high-soft decoration-high",
};

function tickStep(total: number) {
  if (total <= 20) return 5;
  if (total <= 60) return 10;
  if (total <= 120) return 20;
  return 30;
}

export function DropOffMap({
  beats,
  selected,
  onSelect,
  onEdit,
  stale,
}: {
  beats: RiskBeat[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  onEdit: () => void;
  stale: boolean;
}) {
  const { m } = useI18n();
  const total = Math.max(beats.at(-1)?.end ?? 0, 1);
  const step = tickStep(total);
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);
  const counts = { medium: 0, high: 0 };
  for (const b of beats) if (b.risk !== "low") counts[b.risk]++;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 pb-5 pt-5 sm:px-6">
        <div>
          <h2 className="font-display text-lg font-medium tracking-[-0.02em]">{m.map.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {counts.high + counts.medium === 0 ? m.map.clean : m.map.summary(counts.high, counts.medium)}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface-2"
        >
          <PencilSimple size={16} aria-hidden />
          {m.map.editScript}
        </button>
      </div>

      {stale && (
        <p className="border-b border-line bg-accent-soft px-5 py-2.5 text-sm text-ink sm:px-6">{m.map.stale}</p>
      )}

      <div className="px-5 pt-5 sm:px-6">
        <div className="relative">
          <div className="flex h-9 gap-[3px] overflow-hidden rounded-lg" role="group" aria-label={m.map.timeline}>
            {beats.map((b, i) => {
              const width = Math.max(b.end - b.start, 0.6);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onSelect(selected === b.id ? null : b.id)}
                  aria-label={m.map.lineAria(b.id, formatTime(b.start), m.risk[b.risk])}
                  aria-pressed={selected === b.id}
                  style={{ flexGrow: width, ["--i" as string]: i }}
                  className={`bar-in basis-0 transition-[filter,box-shadow] duration-150 hover:brightness-110 ${SEGMENT_TONE[b.risk]} ${
                    selected === b.id ? "shadow-[inset_0_0_0_2px_var(--ink)]" : ""
                  }`}
                />
              );
            })}
          </div>
          <div
            className="pointer-events-none absolute -top-1.5 left-0 h-12 rounded-md border-2 border-ink/80"
            style={{ width: `${Math.min((HOOK_ZONE / total) * 100, 100)}%` }}
            aria-hidden
          />
        </div>
        <div className="relative mt-2 h-5 font-mono text-[11px] text-faint tabular" aria-hidden>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 first:translate-x-0"
              style={{ left: `${(t / total) * 100}%` }}
            >
              {formatTime(t).replace(/\.0$/, "")}
            </span>
          ))}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-4 rounded-[3px] border-2 border-ink/80" aria-hidden /> {m.map.hookZone}
          </span>
          {(["low", "medium", "high"] as const).map((r) => (
            <span key={r} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-[3px] ${SEGMENT_TONE[r]}`} aria-hidden />
              {m.risk[r]}
            </span>
          ))}
        </div>
      </div>

      <ol className="mt-4 flex-1 px-2 pb-4 sm:px-3">
        {beats.map((b, i) => {
          const open = selected === b.id;
          const flagged = b.risk !== "low";
          return (
            <li key={b.id} className="settle" style={{ ["--i" as string]: Math.min(i, 12) }}>
              <button
                type="button"
                onClick={() => onSelect(open ? null : b.id)}
                aria-expanded={flagged ? open : undefined}
                className={`grid w-full grid-cols-[3.25rem_minmax(0,1fr)] gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ${
                  open ? "bg-surface-2" : "hover:bg-surface-2/70"
                }`}
              >
                <span className="pt-[3px] font-mono text-[12px] text-faint tabular">{formatTime(b.start)}</span>
                <span className={`text-[16px] leading-[1.65] ${b.words === 0 ? "italic text-faint" : ""}`}>
                  <span
                    className={`box-decoration-clone rounded-[4px] px-0.5 ${MARK_TONE[b.risk]} ${
                      flagged ? "underline decoration-2 underline-offset-[5px]" : ""
                    }`}
                  >
                    {b.text}
                  </span>
                  {flagged && <span className="sr-only">. {m.risk[b.risk]}: {m.issues[b.issue]}</span>}
                </span>
              </button>
              {open && flagged && (
                <div className="settle mb-2 ml-[4.25rem] mr-3 mt-1 rounded-xl border border-line bg-surface px-4 py-3.5">
                  <p className={`text-sm font-medium ${b.risk === "high" ? "text-high" : "text-mid"}`}>
                    {m.issues[b.issue]}
                  </p>
                  <p className="mt-1 text-[15px] leading-relaxed text-ink">{b.reason}</p>
                  {b.fix && (
                    <p className="mt-3 flex gap-2 text-[15px] leading-relaxed text-muted">
                      <Wrench size={18} className="mt-[3px] shrink-0 text-accent" aria-hidden />
                      <span>{b.fix}</span>
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
