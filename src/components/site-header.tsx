"use client";

import Link from "next/link";
import { AccountButton } from "./account";
import { HistoryButton } from "./history-drawer";
import { LanguageSwitcher, useI18n } from "./i18n";

// `pageTitle`: the editor has no visible heading, so the header adds a hidden one.
export function SiteHeader({ pageTitle = true }: { pageTitle?: boolean }) {
  const { m } = useI18n();
  return (
    <>
      <header className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="rounded-md font-display text-[19px] font-bold tracking-[-0.03em]">
          Hookly
        </Link>
        <div className="flex items-center gap-2">
          <p className="mr-2 hidden text-sm text-muted xl:block">{m.header.tagline}</p>
          <Link href="/pricing" className="mr-1 hidden rounded-md px-1.5 text-sm font-medium text-muted hover:text-ink md:block">
            {m.header.pricing}
          </Link>
          <HistoryButton />
          <LanguageSwitcher />
          <AccountButton />
        </div>
      </header>
      {pageTitle && <h1 className="sr-only">{m.header.srTitle}</h1>}
    </>
  );
}
