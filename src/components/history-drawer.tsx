"use client";

import { ClockCounterClockwise, NotePencil, Trash, X } from "@phosphor-icons/react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PLATFORM_LABEL } from "@/lib/analyzer/config";
import { LOCALE_INFO } from "@/lib/i18n";
import { useAccount } from "./account";
import { useI18n } from "./i18n";
import { del, errorText, get, totalTone, type CheckSummary } from "./shared";

const SCORE_TONE = { low: "text-low", mid: "text-mid", high: "text-high" } as const;

// The open check lives in the URL (?check=<id>), so a reload or the back
// button brings it back. Workspace listens to the same param.
export function openCheck(id: string | null) {
  window.history.pushState(null, "", id ? `?check=${id}` : window.location.pathname);
}

type ListState = { status: "loading" } | { status: "done"; checks: CheckSummary[] } | { status: "error"; error: unknown };

export function HistoryButton() {
  const { m } = useI18n();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-2.5 text-sm font-medium transition-[background-color,border-color] duration-150 hover:border-faint/50 hover:bg-surface-2"
      >
        <ClockCounterClockwise size={16} className="text-accent" aria-hidden />
        <span className="hidden sm:inline">{m.header.history}</span>
        <span className="sr-only sm:hidden">{m.header.history}</span>
      </button>
      {open && <HistoryDrawer onClose={close} />}
    </>
  );
}

function HistoryDrawer({ onClose }: { onClose: () => void }) {
  const { m } = useI18n();
  const { me } = useAccount();
  const activeId = useSearchParams().get("check");
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <div className="drawer-scrim absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="drawer absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col border-l border-line bg-surface shadow-menu focus:outline-none"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id={titleId} className="font-display text-[17px] font-medium tracking-[-0.02em]">
            {m.history.title}
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                openCheck(null);
                onClose();
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-accent transition-colors duration-150 hover:bg-accent-soft"
            >
              <NotePencil size={16} aria-hidden />
              {m.history.newScript}
            </button>
            <button type="button" onClick={onClose} aria-label={m.history.close} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink">
              <X size={18} aria-hidden />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <HistoryList
            activeId={activeId}
            onOpen={(id) => {
              openCheck(id);
              onClose();
            }}
          />
        </div>

        <p className="border-t border-line px-5 py-3.5 text-[13px] leading-relaxed text-faint">
          {me ? m.history.noteAccount : m.history.note}
        </p>
      </div>
    </div>
  );
}

// The visitor's saved checks. With `onOpen`, a plain click opens the check in
// place (the editor page); without it the rows are ordinary links to it.
export function HistoryList({ activeId = null, onOpen }: { activeId?: string | null; onOpen?: (id: string) => void }) {
  const { m, locale } = useI18n();
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    get<{ checks: CheckSummary[] }>("/api/history")
      .then(({ checks }) => live && setList({ status: "done", checks }))
      .catch((error) => live && setList({ status: "error", error }));
    return () => {
      live = false;
    };
  }, []);

  async function remove(id: string) {
    setDeleting(id);
    try {
      await del(`/api/history/${id}`);
      setList((l) => (l.status === "done" ? { ...l, checks: l.checks.filter((c) => c.id !== id) } : l));
    } catch (error) {
      setList({ status: "error", error });
    } finally {
      setDeleting(null);
    }
  }

  const date = new Intl.DateTimeFormat(LOCALE_INFO[locale].tag, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  if (list.status === "loading") {
    return (
      <div className="space-y-5 px-5 py-5" role="status" aria-label={m.common.loading}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="h-4 w-3/4 rounded bg-surface-2" />
              <div className="mt-2 h-3 w-1/3 rounded bg-surface-2" />
            </div>
            <div className="h-7 w-9 rounded bg-surface-2" />
          </div>
        ))}
      </div>
    );
  }
  if (list.status === "error") {
    return (
      <p className="px-5 py-5 text-sm text-high" role="alert">
        {m.history.failed} {errorText(list.error, m)}
      </p>
    );
  }
  if (list.checks.length === 0) {
    return (
      <div className="px-5 py-8">
        <ClockCounterClockwise size={26} className="text-faint" aria-hidden />
        <p className="mt-3 max-w-[40ch] text-[15px] leading-relaxed text-muted">{m.history.empty}</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {list.checks.map((c) => {
        const title = c.title || m.history.untitled;
        const active = c.id === activeId;
        return (
          <li key={c.id} className={`group relative flex items-center gap-2 pr-2 ${active ? "bg-accent-soft/60" : "hover:bg-surface-2"}`}>
            <a
              href={`/?check=${c.id}`}
              aria-current={active ? "page" : undefined}
              onClick={(e) => {
                if (!onOpen || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                onOpen(c.id);
              }}
              className="flex min-w-0 flex-1 items-center gap-4 py-3.5 pl-5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{title}</span>
                <span className="mt-0.5 block text-[13px] text-faint">
                  {PLATFORM_LABEL[c.platform]} · {date.format(new Date(c.createdAt))}
                </span>
              </span>
              <span className={`font-display text-xl font-bold tracking-[-0.03em] tabular ${SCORE_TONE[totalTone(c.total)]}`}>
                {c.total}
              </span>
            </a>
            <button
              type="button"
              onClick={() => remove(c.id)}
              disabled={deleting === c.id}
              aria-label={m.history.remove(title)}
              className="rounded-lg p-2 text-faint opacity-100 transition-[opacity,color] duration-150 hover:text-high focus-visible:opacity-100 disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <Trash size={16} aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
