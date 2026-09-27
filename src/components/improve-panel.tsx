"use client";

import { ArrowUUpLeft, Check, Copy, MagicWand, Sparkle } from "@phosphor-icons/react";
import { useState } from "react";
import { QuotaUpsell } from "./billing";
import { useI18n } from "./i18n";
import { errorText, type Hook, type RewriteView } from "./shared";

// Errors are kept raw and phrased at render time, so they follow a language switch.
export type Async<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: T }
  | { status: "error"; error: unknown };

function CopyButton({ text, label }: { text: string; label: string }) {
  const { m } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
    >
      {copied ? <Check size={16} className="text-low" aria-hidden /> : <Copy size={16} aria-hidden />}
      {copied ? m.common.copied : label}
    </button>
  );
}

function ErrorLine({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { m } = useI18n();
  return (
    <div className="mt-3">
      <p className="text-sm text-high" role="alert">
        {errorText(error, m)}{" "}
        <button type="button" onClick={onRetry} className="font-medium underline underline-offset-4">
          {m.common.tryAgain}
        </button>
      </p>
      <QuotaUpsell error={error} />
    </div>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  const { m } = useI18n();
  return (
    <div className="mt-4 space-y-4" role="status" aria-label={m.common.loading}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i}>
          <div className="h-3 w-24 rounded bg-surface-2" />
          <div className="mt-2 h-4 w-full rounded bg-surface-2" />
          <div className="mt-1.5 h-4 w-2/3 rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

export function HooksSection({
  state,
  onGenerate,
  onUse,
}: {
  state: Async<Hook[]>;
  onGenerate: () => void;
  onUse: (hook: Hook) => void;
}) {
  const { m, num } = useI18n();
  return (
    <section className="px-6 py-5" aria-labelledby="hooks-heading">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 id="hooks-heading" className="font-display text-[15px] font-medium tracking-[-0.01em]">
            {m.hooks.title}
          </h3>
          <p className="mt-1 text-sm text-muted">{m.hooks.subtitle}</p>
        </div>
        {state.status !== "done" && (
          <button
            type="button"
            onClick={onGenerate}
            disabled={state.status === "loading"}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium transition-[transform,background-color] duration-150 hover:bg-surface-2 active:scale-[0.98] disabled:opacity-50"
          >
            <Sparkle size={17} weight="fill" className="text-accent" aria-hidden />
            {state.status === "loading" ? m.hooks.writing : m.hooks.write}
          </button>
        )}
      </div>

      {state.status === "loading" && <ListSkeleton rows={3} />}
      {state.status === "error" && <ErrorLine error={state.error} onRetry={onGenerate} />}
      {state.status === "done" && (
        <ul className="mt-4 divide-y divide-line">
          {state.data.map((h, i) => (
            <li key={i} className="settle py-4 first:pt-1" style={{ ["--i" as string]: i }}>
              <p className="text-[13px] text-faint">
                {m.hookTypes[h.type]}
                <span className="ml-2 font-mono tabular">
                  ~{num(h.seconds, 1)} {m.common.seconds}
                </span>
              </p>
              <p className="mt-1.5 text-[17px] font-medium leading-snug">&ldquo;{h.spoken}&rdquo;</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {m.hooks.onScreen} {h.visual}
                {h.onScreenText && (
                  <>
                    {" "}
                    {m.hooks.overlay} &ldquo;{h.onScreenText}&rdquo;
                  </>
                )}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-faint">{h.whyItWorks}</p>
              <div className="mt-2.5 flex gap-1 -ml-2.5">
                <button
                  type="button"
                  onClick={() => onUse(h)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-accent transition-colors duration-150 hover:bg-accent-soft"
                >
                  <ArrowUUpLeft size={16} aria-hidden />
                  {m.hooks.use}
                </button>
                <CopyButton text={h.spoken} label={m.common.copy} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RewriteSection({
  state,
  weakCount,
  scoreBefore,
  onGenerate,
  onApply,
}: {
  state: Async<RewriteView>;
  weakCount: number;
  scoreBefore: number;
  onGenerate: () => void;
  onApply: (rewrite: RewriteView) => void;
}) {
  const { m } = useI18n();
  const after = state.status === "done" ? state.data.after : null;
  const worse = after != null && after.total < scoreBefore;
  return (
    <section className="border-t border-line px-6 py-5" aria-labelledby="rewrite-heading">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 id="rewrite-heading" className="font-display text-[15px] font-medium tracking-[-0.01em]">
            {m.rewrite.title}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {weakCount === 0 ? m.rewrite.nothing : m.rewrite.subtitle(weakCount)}
          </p>
        </div>
        {state.status !== "done" && weakCount > 0 && (
          <button
            type="button"
            onClick={onGenerate}
            disabled={state.status === "loading"}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium transition-[transform,background-color] duration-150 hover:bg-surface-2 active:scale-[0.98] disabled:opacity-50"
          >
            <MagicWand size={17} weight="fill" className="text-accent" aria-hidden />
            {state.status === "loading" ? m.rewrite.rewriting : m.rewrite.rewrite}
          </button>
        )}
      </div>

      {state.status === "loading" && <ListSkeleton rows={Math.min(weakCount, 3)} />}
      {state.status === "error" && <ErrorLine error={state.error} onRetry={onGenerate} />}
      {state.status === "done" && (
        <div className="mt-4">
          {state.data.voiceNotes && (
            <p className="text-sm leading-relaxed text-faint">
              {m.rewrite.keptVoice} {state.data.voiceNotes}
            </p>
          )}
          <ul className="mt-3 divide-y divide-line">
            {state.data.edits.map((e, i) => (
              <li key={e.beatId} className="settle py-3.5" style={{ ["--i" as string]: i }}>
                <p className="font-mono text-[12px] text-faint">{m.rewrite.line(e.beatId)}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-faint line-through decoration-faint/60">{e.original}</p>
                <p className="mt-1 text-[15px] font-medium leading-relaxed">{e.rewritten || m.rewrite.cut}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{e.changeNote}</p>
              </li>
            ))}
          </ul>
          {after && (
            <p className={`mt-3 text-sm leading-relaxed ${worse ? "text-high" : "text-low"}`} role="status">
              {worse ? m.rewrite.worse(scoreBefore, after.total) : m.rewrite.checked(scoreBefore, after.total)}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onApply(state.data)}
              className={
                worse
                  ? "inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium transition-[transform,background-color] duration-150 hover:bg-surface-2 active:scale-[0.98]"
                  : "inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-ink transition-transform duration-150 active:scale-[0.98]"
              }
            >
              <Check size={17} weight="bold" aria-hidden />
              {m.rewrite.apply}
            </button>
            <CopyButton text={state.data.script} label={m.rewrite.copyAll} />
            <span className="font-mono text-[13px] text-faint tabular">
              ~{Math.round(state.data.durationSeconds)} {m.common.seconds}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
