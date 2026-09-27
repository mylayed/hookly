"use client";

import { InstagramLogo, Lightning, TiktokLogo, YoutubeLogo } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { useId } from "react";
import { IDEAL_SECONDS, MAX_SCRIPT_WORDS, PLATFORM_LABEL, PLATFORMS, type Pace, type Platform } from "@/lib/analyzer/config";
import { countSpokenWords, estimateDuration } from "@/lib/analyzer/segment";
import { useI18n } from "./i18n";
import type { Draft, UsageView } from "./shared";

const PLATFORM_ICON: Record<Platform, Icon> = {
  youtube_shorts: YoutubeLogo,
  instagram_reels: InstagramLogo,
  tiktok: TiktokLogo,
};

const PACES: Pace[] = ["calm", "normal", "fast"];

export function ScriptEditor({
  draft,
  onChange,
  onSubmit,
  busy,
  usage,
  upsell = false,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  onSubmit: () => void;
  busy: boolean;
  // Daily check quota; null until loaded (or if it failed to load).
  usage: UsageView | null;
  // Free plan: when the limit is reached, point to Pro.
  upsell?: boolean;
}) {
  const { m } = useI18n();
  const ids = { script: useId(), niche: useId(), help: useId() };
  const words = countSpokenWords(draft.script);
  const seconds = estimateDuration(draft.script, draft.pace);
  const [lo, hi] = IDEAL_SECONDS[draft.platform];
  const tooLong = words > MAX_SCRIPT_WORDS;
  const left = usage ? Math.max(0, usage.limit - usage.used) : null;
  const lengthNote =
    words === 0
      ? m.editor.sweetSpot(lo, hi)
      : seconds < lo
        ? m.editor.tooShort
        : seconds > hi
          ? m.editor.tooLong
          : m.editor.inSweetSpot;

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="space-y-4 border-b border-line px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-muted">{m.editor.platform}</legend>
            <div className="inline-flex h-10 items-center rounded-xl bg-surface-2 p-1">
              {PLATFORMS.map((p) => {
                const PlatformIcon = PLATFORM_ICON[p];
                const active = draft.platform === p;
                return (
                  <label
                    key={p}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                      active ? "bg-surface font-medium text-ink shadow-panel" : "text-muted hover:text-ink"
                    }`}
                  >
                    <input
                      type="radio"
                      name="platform"
                      value={p}
                      checked={active}
                      onChange={() => onChange({ ...draft, platform: p })}
                      className="sr-only"
                    />
                    <PlatformIcon size={18} weight={active ? "fill" : "regular"} aria-hidden />
                    <span className="hidden md:inline">{PLATFORM_LABEL[p].replace("YouTube ", "").replace("Instagram ", "")}</span>
                    <span className="sr-only md:hidden">{PLATFORM_LABEL[p]}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-muted">{m.editor.voiceover}</legend>
            <div className="inline-flex h-10 items-center rounded-xl bg-surface-2 p-1">
              {PACES.map((p) => (
                <label
                  key={p}
                  className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-sm transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                    draft.pace === p ? "bg-surface font-medium text-ink shadow-panel" : "text-muted hover:text-ink"
                  }`}
                >
                  <input
                    type="radio"
                    name="pace"
                    value={p}
                    checked={draft.pace === p}
                    onChange={() => onChange({ ...draft, pace: p })}
                    className="sr-only"
                  />
                  {m.editor.paces[p]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div>
          <label htmlFor={ids.niche} className="mb-2 block text-sm font-medium text-muted">
            {m.editor.niche}
          </label>
          <input
            id={ids.niche}
            value={draft.niche}
            onChange={(e) => onChange({ ...draft, niche: e.target.value })}
            placeholder={m.editor.nichePlaceholder}
            maxLength={80}
            className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-5 pt-5 sm:px-6">
        <label htmlFor={ids.script} className="text-sm font-medium text-muted">
          {m.editor.script}
        </label>
        <p id={ids.help} className="mt-1 text-sm text-faint">
          {m.editor.scriptHelp} {m.editor.anyLanguage}
        </p>
        <textarea
          id={ids.script}
          aria-describedby={ids.help}
          value={draft.script}
          onChange={(e) => onChange({ ...draft, script: e.target.value })}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder={m.editor.scriptPlaceholder}
          spellCheck
          className="mt-3 min-h-[340px] w-full flex-1 resize-none [field-sizing:content] bg-transparent text-[17px] leading-[1.7] text-ink placeholder:text-faint focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 sm:px-6">
        <p className="font-mono text-[13px] text-muted tabular" aria-live="polite">
          <span className={tooLong ? "text-high" : undefined}>{m.editor.words(words)}</span>
          <span className="mx-2 text-faint">/</span>~{Math.round(seconds)} {m.common.seconds}
          <span className="ml-3 font-sans text-faint">{tooLong ? m.editor.limit(MAX_SCRIPT_WORDS) : lengthNote}</span>
        </p>
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          {usage && usage.used > 0 && (
            <p className={`text-[13px] ${left === 0 ? "text-high" : "text-faint"}`}>
              {left === 0 ? m.limits.reached(usage.resetInHours ?? 24) : m.limits.left(left!, usage.limit)}
              {left === 0 && upsell && (
                <Link href="/pricing" className="ml-2 font-medium text-accent underline-offset-4 hover:underline">
                  {m.pricing.upgrade}
                </Link>
              )}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || words === 0 || tooLong || left === 0}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-medium text-accent-ink transition-[transform,opacity] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Lightning size={18} weight="fill" aria-hidden />
            {busy ? m.editor.checking : m.editor.check}
          </button>
        </div>
      </div>
    </form>
  );
}
