"use client";

import { FilmStrip, WarningCircle, X } from "@phosphor-icons/react";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { LOCALE_INFO, type Locale } from "@/lib/i18n";
import { QuotaUpsell } from "./billing";
import { DropOffMap } from "./drop-off-map";
import { openCheck } from "./history-drawer";
import { HooksSection, RewriteSection, type Async } from "./improve-panel";
import { ScorePanel, ScoreSkeleton } from "./score-panel";
import { ScriptEditor } from "./script-editor";
import { useI18n } from "./i18n";
import {
  errorText,
  get,
  post,
  type AnalysisView,
  type Draft,
  type Hook,
  type RewriteView,
  type SavedCheck,
  type UsageSummary,
} from "./shared";

const DRAFT_KEY = "hookcheck:draft";
const EMPTY: Draft = { script: "", platform: "youtube_shorts", niche: "", pace: "normal" };

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

function saveDraft(d: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // Storage unavailable (private mode); the draft just won't survive a reload.
  }
}

export function Workspace() {
  const { m, locale } = useI18n();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [mode, setMode] = useState<"edit" | "review">("edit");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<unknown>(null);
  // Stored as a key so the banner follows a language switch.
  const [notice, setNotice] = useState<"hookApplied" | "rewriteApplied" | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisView | null>(null);
  const [checked, setChecked] = useState<Draft | null>(null);
  // Language the current feedback was written in.
  const [feedbackLocale, setFeedbackLocale] = useState<Locale | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [hooks, setHooks] = useState<Async<Hook[]>>({ status: "idle" });
  const [rewrite, setRewrite] = useState<Async<RewriteView>>({ status: "idle" });
  // Id of the saved check on screen; mirrors ?check= in the URL.
  const [checkId, setCheckId] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const urlCheckId = useSearchParams().get("check");

  useEffect(() => {
    // A check in the URL wins over the local draft (see the effect below).
    const saved = new URLSearchParams(window.location.search).has("check") ? null : loadDraft();
    // Restoring from localStorage has to wait for mount to avoid a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setDraft(saved);
    refreshUsage();
    // Quota slots free up over time; pick that up when the tab comes back.
    const onVisible = () => document.visibilityState === "visible" && refreshUsage();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Opens a check from history (or a reload / back button). A check we just
  // ran is already on screen, so it is skipped.
  useEffect(() => {
    if (urlCheckId === checkId) return;
    if (!urlCheckId) {
      // "New script": back to an empty editor.
      /* eslint-disable react-hooks/set-state-in-effect */
      setCheckId(null);
      setAnalysis(null);
      setChecked(null);
      setError(null);
      setNotice(null);
      setMode("edit");
      /* eslint-enable react-hooks/set-state-in-effect */
      update({ ...EMPTY, platform: draft.platform, pace: draft.pace });
      return;
    }
    let live = true;
    get<SavedCheck>(`/api/history/${urlCheckId}`)
      .then((saved) => {
        if (!live) return;
        setCheckId(saved.id);
        update(saved.draft);
        setAnalysis(saved.analysis);
        setChecked(saved.draft);
        setFeedbackLocale(saved.locale);
        setHooks(saved.hooks ? { status: "done", data: saved.hooks } : { status: "idle" });
        setRewrite(saved.rewrite ? { status: "done", data: saved.rewrite } : { status: "idle" });
        setSelected(null);
        setError(null);
        setNotice(null);
        setMode("review");
      })
      .catch((e) => {
        if (!live) return;
        setError(e);
        // Point the URL back at what is actually on screen.
        window.history.replaceState(null, "", checkId ? `?check=${checkId}` : window.location.pathname);
      })
    return () => {
      live = false;
    };
    // Only URL changes should trigger a load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCheckId]);

  function refreshUsage() {
    get<UsageSummary>("/api/usage")
      .then(setUsage)
      .catch(() => setUsage(null));
  }

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [loading]);

  function update(next: Draft) {
    setDraft(next);
    saveDraft(next);
  }

  async function check() {
    if (loading || !draft.script.trim()) return;
    setLoading(true);
    setElapsed(0);
    setError(null);
    setNotice(null);
    try {
      const snapshot = { ...draft };
      const { id, analysis: result } = await post<{ id: string; analysis: AnalysisView }>("/api/analyze", {
        ...snapshot,
        locale,
        // Anchors the re-check to the check on screen, so only the edits move the score.
        baseCheckId: checkId ?? undefined,
      });
      setCheckId(id);
      openCheck(id);
      setAnalysis(result);
      setChecked(snapshot);
      setFeedbackLocale(locale);
      setHooks({ status: "idle" });
      setRewrite({ status: "idle" });
      setSelected(null);
      setMode("review");
      requestAnimationFrame(() => reviewRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
      refreshUsage();
    }
  }

  async function writeHooks() {
    if (!checkId) return;
    setHooks({ status: "loading" });
    try {
      const { hooks: data } = await post<{ hooks: Hook[] }>("/api/hooks", { checkId, locale });
      setHooks({ status: "done", data });
    } catch (e) {
      setHooks({ status: "error", error: e });
    }
  }

  async function writeRewrite() {
    if (!checkId) return;
    setRewrite({ status: "loading" });
    try {
      const data = await post<RewriteView>("/api/rewrite", { checkId, locale });
      setRewrite({ status: "done", data });
    } catch (e) {
      setRewrite({ status: "error", error: e });
    }
  }

  function applyHook(hook: Hook) {
    const first = analysis?.beats.find((b) => b.words > 0);
    const script =
      first && draft.script.includes(first.text)
        ? draft.script.replace(first.text, hook.spoken)
        : `${hook.spoken}\n${draft.script}`;
    update({ ...draft, script });
    setMode("edit");
    setNotice("hookApplied");
  }

  async function applyRewrite(data: RewriteView) {
    if (!data.after || !checkId) {
      update({ ...draft, script: data.script });
      setMode("edit");
      setNotice("rewriteApplied");
      return;
    }
    // The rewrite was already re-checked: open that result as a new check.
    try {
      const { id, draft: next } = await post<{ id: string; draft: Draft }>("/api/rewrite/apply", { checkId, locale });
      update(next);
      setCheckId(id);
      openCheck(id);
      setAnalysis(data.after);
      setChecked(next);
      setFeedbackLocale(data.locale ?? locale);
      setHooks({ status: "idle" });
      setRewrite({ status: "idle" });
      setSelected(null);
      setError(null);
      setNotice(null);
      setMode("review");
    } catch (e) {
      setError(e);
    }
  }

  const stale = checked !== null && (checked.script !== draft.script || checked.platform !== draft.platform || checked.pace !== draft.pace);
  const weakCount = analysis?.beats.filter((b) => b.risk !== "low").length ?? 0;

  return (
    <div ref={reviewRef} className="grid scroll-mt-4 items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="min-w-0 overflow-hidden rounded-2xl bg-surface shadow-panel lg:sticky lg:top-5">
        {notice && mode === "edit" && (
          <div className="flex items-center justify-between gap-3 border-b border-line bg-accent-soft px-5 py-2.5 text-sm sm:px-6" role="status">
            {m.workspace[notice]}
            <button type="button" onClick={() => setNotice(null)} aria-label={m.common.dismiss} className="rounded p-1 text-muted hover:text-ink">
              <X size={16} aria-hidden />
            </button>
          </div>
        )}
        {mode === "review" && analysis ? (
          <DropOffMap
            beats={analysis.beats}
            selected={selected}
            onSelect={setSelected}
            onEdit={() => setMode("edit")}
            stale={stale}
          />
        ) : (
          <ScriptEditor draft={draft} onChange={update} onSubmit={check} busy={loading} usage={usage?.analyze ?? null} upsell={usage?.plan === "free"} />
        )}
      </div>

      <div className="min-w-0 space-y-5">
        {error != null && (
          <div className="flex gap-3 rounded-2xl border border-high/30 bg-high-soft px-5 py-4 text-[15px]" role="alert">
            <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-high" aria-hidden />
            <div>
              <p>{errorText(error, m)}</p>
              <QuotaUpsell error={error} />
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl bg-surface shadow-panel">
          {loading ? (
            <ScoreSkeleton elapsed={elapsed} />
          ) : analysis ? (
            <>
            {stale && (
              <p className="border-b border-line bg-accent-soft px-6 py-2.5 text-sm">{m.workspace.staleScore}</p>
            )}
            {!stale && feedbackLocale && feedbackLocale !== locale && (
              <p className="flex flex-wrap items-center gap-x-2 border-b border-line bg-accent-soft px-6 py-2.5 text-sm">
                {m.workspace.otherLanguage(LOCALE_INFO[feedbackLocale].native)}
                <button type="button" onClick={check} className="font-medium text-accent underline-offset-4 hover:underline">
                  {m.workspace.recheck}
                </button>
              </p>
            )}
            <ScorePanel
              key={analysis.summary + analysis.total}
              analysis={analysis}
              onSelectBeat={(id) => {
                setMode("review");
                setSelected(id);
              }}
            />
            </>
          ) : (
            <EmptyState
              onSample={() => {
                update({ ...draft, script: m.sample.script, niche: draft.niche || m.sample.niche, platform: "tiktok" });
                setMode("edit");
              }}
            />
          )}
        </div>

        {analysis && !loading && (
          <div className="overflow-hidden rounded-2xl bg-surface shadow-panel">
            <HooksSection state={hooks} onGenerate={writeHooks} onUse={applyHook} />
            <RewriteSection
              state={rewrite}
              weakCount={weakCount}
              scoreBefore={analysis.total}
              onGenerate={writeRewrite}
              onApply={applyRewrite}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onSample }: { onSample: () => void }) {
  const { m } = useI18n();
  return (
    <div className="px-6 py-8">
      <FilmStrip size={28} className="text-accent" aria-hidden />
      <h2 className="mt-4 font-display text-xl font-medium leading-snug tracking-[-0.02em]">{m.empty.title}</h2>
      <p className="mt-2 max-w-[48ch] text-[15px] leading-relaxed text-muted">{m.empty.body}</p>
      <dl className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
        {m.empty.points.map(([term, detail]) => (
          <Fragment key={term}>
            <dt className="font-medium">{term}</dt>
            <dd className="text-muted">{detail}</dd>
          </Fragment>
        ))}
      </dl>
      <button
        type="button"
        onClick={onSample}
        className="mt-7 inline-flex h-10 items-center rounded-xl border border-line px-4 text-sm font-medium transition-colors duration-150 hover:bg-surface-2"
      >
        {m.empty.sample}
      </button>
    </div>
  );
}
