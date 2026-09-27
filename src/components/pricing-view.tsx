"use client";

import { Check, Crown } from "@phosphor-icons/react";
import Link from "next/link";
import { LOCALE_INFO } from "@/lib/i18n";
import { formatPrice, PlanButton, useBilling, type BillingInfo } from "./billing";
import { useI18n } from "./i18n";
import { errorText, type Plan, type UsageKind } from "./shared";

const KINDS: UsageKind[] = ["analyze", "hooks", "rewrite"];

export function PricingView() {
  const { m } = useI18n();
  const { info, error } = useBilling();

  return (
    <div className="mx-auto max-w-[880px] pt-6">
      <h1 className="font-display text-[32px] font-medium leading-tight tracking-[-0.03em]">{m.pricing.title}</h1>
      <p className="mt-2 max-w-[52ch] text-[17px] leading-relaxed text-muted">{m.pricing.subtitle}</p>

      {error != null && (
        <p className="mt-6 text-sm text-high" role="alert">
          {errorText(error, m)}
        </p>
      )}

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <PlanColumn plan="free" info={info} />
        <PlanColumn plan="pro" info={info} />
      </div>

      <p className="mt-6 max-w-[70ch] text-[13px] leading-relaxed text-faint">{m.pricing.note}</p>
    </div>
  );
}

function PlanColumn({ plan, info }: { plan: Plan; info: BillingInfo | null }) {
  const { m, locale } = useI18n();
  const pro = plan === "pro";
  const current = info?.plan === plan;

  const price = pro
    ? info?.price
      ? `${formatPrice(info.price, LOCALE_INFO[locale].tag)}`
      : null
    : formatPrice({ amount: 0, currency: info?.price?.currency ?? "usd", interval: "month" }, LOCALE_INFO[locale].tag);
  const interval = info?.price ? m.pricing.interval[info.price.interval as "month" | "year"] ?? info.price.interval : m.pricing.interval.month;

  return (
    <section
      aria-labelledby={`plan-${plan}`}
      className={`relative flex flex-col rounded-2xl bg-surface p-6 shadow-panel ${pro ? "ring-2 ring-accent" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={`plan-${plan}`} className="flex items-center gap-2 font-display text-xl font-medium tracking-[-0.02em]">
          {pro && <Crown size={20} weight="fill" className="text-accent" aria-hidden />}
          {pro ? m.pricing.pro : m.pricing.free}
        </h2>
        {current && (
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-medium text-accent">{m.pricing.current}</span>
        )}
      </div>
      <p className="mt-1 text-[15px] text-muted">{pro ? m.pricing.proTagline : m.pricing.freeTagline}</p>

      <p className="mt-6 flex items-baseline gap-1.5">
        {info ? (
          <>
            <span className="font-display text-[40px] font-bold leading-none tracking-[-0.04em] tabular">{price ?? "—"}</span>
            {price && <span className="text-[15px] text-faint">/ {interval}</span>}
          </>
        ) : (
          <span className="h-10 w-28 rounded-lg bg-surface-2" aria-hidden />
        )}
      </p>
      {pro && info && !info.price && <p className="mt-2 text-sm text-faint">{m.pricing.unavailable}</p>}

      <ul className="mt-6 flex-1 space-y-3 text-[15px]">
        {KINDS.map((kind) => (
          <li key={kind} className="flex items-start gap-2.5">
            <Check size={18} weight="bold" className={`mt-0.5 shrink-0 ${pro ? "text-accent" : "text-faint"}`} aria-hidden />
            <span>
              {m.account.usageKinds[kind]}:{" "}
              <span className="font-medium tabular">{info ? m.pricing.perDay(info.limits[plan][kind]) : "…"}</span>
            </span>
          </li>
        ))}
        <li className="flex items-start gap-2.5">
          <Check size={18} weight="bold" className={`mt-0.5 shrink-0 ${pro ? "text-accent" : "text-faint"}`} aria-hidden />
          <span>{pro ? m.pricing.proExtra : m.pricing.freeExtra}</span>
        </li>
      </ul>

      <div className="mt-8">
        {pro ? (
          info && <PlanButton plan={info.plan} available={info.price !== null} />
        ) : (
          !current || !info ? null : (
            <Link
              href="/"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-line px-5 text-[15px] font-medium transition-colors duration-150 hover:bg-surface-2"
            >
              {m.pricing.freeCta}
            </Link>
          )
        )}
      </div>
    </section>
  );
}
