"use client";

import { CaretDown, Check, Globe } from "@phosphor-icons/react";
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DICTIONARIES, LOCALE_COOKIE, LOCALE_INFO, LOCALES, type Locale, type Messages } from "@/lib/i18n";

interface I18n {
  locale: Locale;
  m: Messages;
  setLocale: (next: Locale) => void;
  // Locale-aware number formatting (decimal comma in uk/es/pt/fr/de/pl).
  num: (n: number, digits?: number) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState(initialLocale);

  function setLocale(next: Locale) {
    setLocaleState(next);
    // The cookie lets the server render the next visit in this language right away.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = LOCALE_INFO[next].tag;
    document.title = DICTIONARIES[next].meta.title;
  }

  const tag = LOCALE_INFO[locale].tag;
  const value: I18n = {
    locale,
    m: DICTIONARIES[locale],
    setLocale,
    num: (n, digits = 0) =>
      n.toLocaleString(tag, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

// Custom listbox instead of a native <select>: native option lists can't be
// themed (they render light on a dark page) and flash a focus ring on click.
export function LanguageSwitcher() {
  const { locale, m, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function openList() {
    setActive(LOCALES.indexOf(locale));
    setOpen(true);
  }

  function choose(next: Locale) {
    setLocale(next);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onListKey(e: React.KeyboardEvent) {
    const last = LOCALES.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(active + 1, last),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: last,
    };
    if (e.key in moves) {
      e.preventDefault();
      setActive(moves[e.key]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(LOCALES[active]);
    } else if (e.key === " ") {
      // Chosen on keyup: choosing here moves focus to the trigger, and the
      // Space keyup would then "click" it and reopen the menu.
      e.preventDefault();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${m.header.languageHint}: ${LOCALE_INFO[locale].native}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            openList();
          }
        }}
        className={`group inline-flex h-9 items-center gap-2 rounded-xl border pl-2.5 pr-2 text-sm font-medium text-ink transition-[background-color,border-color] duration-150 ${
          open ? "border-accent/50 bg-surface-2" : "border-line bg-surface hover:border-faint/50 hover:bg-surface-2"
        }`}
      >
        <Globe size={16} weight={open ? "fill" : "regular"} className="text-accent" aria-hidden />
        <span>{LOCALE_INFO[locale].native}</span>
        <CaretDown
          size={12}
          weight="bold"
          className={`text-muted transition-transform duration-200 ease-out-quint ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={m.header.languageHint}
          aria-activedescendant={`${listId}-${LOCALES[active]}`}
          onKeyDown={onListKey}
          onKeyUp={(e) => {
            if (e.key === " ") choose(LOCALES[active]);
          }}
          className="lang-menu absolute right-0 top-[calc(100%+8px)] z-50 w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-menu focus:outline-none"
        >
          <li role="presentation" className="px-2.5 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            {m.header.language}
          </li>
          {LOCALES.map((l, i) => {
            const selected = l === locale;
            return (
              <li
                key={l}
                id={`${listId}-${l}`}
                role="option"
                aria-selected={selected}
                lang={LOCALE_INFO[l].tag}
                onPointerMove={() => setActive(i)}
                onClick={() => choose(l)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors duration-100 ${
                  selected ? "font-medium text-accent" : "text-ink"
                } ${i === active ? (selected ? "bg-accent-soft" : "bg-surface-2") : selected ? "bg-accent-soft/60" : ""}`}
              >
                <span
                  className={`w-7 shrink-0 rounded-md py-0.5 text-center font-mono text-[10px] font-medium uppercase ${
                    selected ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted"
                  }`}
                  aria-hidden
                >
                  {l}
                </span>
                <span className="flex-1">{LOCALE_INFO[l].native}</span>
                {selected && <Check size={16} weight="bold" className="text-accent" aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
