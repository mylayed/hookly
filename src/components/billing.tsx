"use client";

import { ArrowRight, Crown, Lightning } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LOCALE_INFO, type Locale } from "@/lib/i18n";
import { useAccount } from "./account";
import { useI18n } from "./i18n";
import { ApiError, errorText, get, post, type Plan, type SubscriptionView, type UsageKind } from "./shared";

export interface BillingInfo {
  plan: Plan;
  subscription: SubscriptionView | null;
  // Null when Paddle isn't configured or the price couldn't be loaded.
  price: { amount: number; currency: string; interval: string } | null;
  limits: Record<Plan, Record<UsageKind, number>>;
}

// `refresh` re-reads the subscription from Paddle first (account page).
export function useBilling(refresh = false) {
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    get<BillingInfo>(refresh ? "/api/billing?refresh=1" : "/api/billing")
      .then(setInfo)
      .catch(setError);
  }, [refresh]);
  return { info, error };
}

// --- Paddle.js ---------------------------------------------------------------

interface PaddleEvent {
  name?: string;
  data?: { transaction_id?: string };
}

interface PaddleJs {
  Environment: { set: (env: "sandbox" | "production") => void };
  Initialize: (opts: { token: string; eventCallback: (e: PaddleEvent) => void }) => void;
  Checkout: {
    open: (opts: { transactionId: string; settings?: Record<string, string> }) => void;
    close: () => void;
  };
}

declare global {
  interface Window {
    Paddle?: PaddleJs;
  }
}

// Paddle's checkout languages that match Hookly's; others fall back to the browser's.
const CHECKOUT_LOCALE: Partial<Record<Locale, string>> = { en: "en", es: "es", pt: "pt", fr: "fr", de: "de", pl: "pl" };

let paddleReady: Promise<PaddleJs> | null = null;
// Paddle.Initialize takes one callback for the page; it forwards to the current checkout.
let onPaddleEvent: (e: PaddleEvent) => void = () => {};

function loadPaddle(token: string, environment: "sandbox" | "production"): Promise<PaddleJs> {
  paddleReady ??= new Promise<PaddleJs>((resolve, reject) => {
    const script = document.createElement("script");
    // Paddle requires loading Paddle.js from its own CDN.
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = () => {
      const P = window.Paddle;
      if (!P) return reject(new Error("Paddle.js did not load"));
      if (environment === "sandbox") P.Environment.set("sandbox");
      P.Initialize({ token, eventCallback: (e) => onPaddleEvent(e) });
      resolve(P);
    };
    script.onerror = () => {
      paddleReady = null;
      reject(new ApiError("network", "Could not load the payment form."));
    };
    document.head.appendChild(script);
  });
  return paddleReady;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Paddle creates the subscription a moment after the payment; poll until it's in.
async function waitForSubscription(transactionId: string) {
  for (let i = 0; i < 8; i++) {
    try {
      const { synced } = await post<{ synced: boolean }>("/api/billing/sync", { transactionId });
      if (synced) return;
    } catch {
      // The webhook will still catch up; keep trying for a few seconds.
    }
    await sleep(1500);
  }
}

// Opens Paddle's overlay; resolves once the payment went through and Pro is on,
// or when the visitor closes the checkout (then with false).
async function openCheckout(locale: Locale): Promise<boolean> {
  const start = await post<{ transactionId: string; clientToken: string; environment: "sandbox" | "production" }>(
    "/api/billing/checkout",
    {},
  );
  const P = await loadPaddle(start.clientToken, start.environment);
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return new Promise<boolean>((resolve) => {
    onPaddleEvent = async (e) => {
      if (e.name === "checkout.completed") {
        await waitForSubscription(e.data?.transaction_id ?? start.transactionId);
        P.Checkout.close();
        resolve(true);
      } else if (e.name === "checkout.closed") {
        resolve(false);
      }
    };
    const settings: Record<string, string> = { displayMode: "overlay", theme: dark ? "dark" : "light" };
    if (CHECKOUT_LOCALE[locale]) settings.locale = CHECKOUT_LOCALE[locale]!;
    P.Checkout.open({ transactionId: start.transactionId, settings });
  });
}

async function openPortal() {
  const { url } = await post<{ url: string }>("/api/billing/portal", {});
  window.location.assign(url);
}

// The one billing button: sign in (guest), upgrade (free) or manage (Pro).
export function PlanButton({ plan, available, className = "" }: { plan: Plan; available: boolean; className?: string }) {
  const { m, locale } = useI18n();
  const { me, openSignIn } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function run() {
    if (!me) return openSignIn();
    setBusy(true);
    setError(null);
    try {
      if (plan === "pro") return await openPortal();
      const paid = await openCheckout(locale);
      // Full reload: plan, limits and the header all change with Pro.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (paid) return window.location.assign("/account?upgraded=1");
      setBusy(false);
    } catch (e) {
      let failure = e;
      // Subscribed in another tab since this page loaded: manage instead.
      if (e instanceof ApiError && e.code === "already_subscribed") {
        try {
          return await openPortal();
        } catch (inner) {
          failure = inner;
        }
      }
      setError(failure);
      setBusy(false);
    }
  }

  const label = !me ? m.pricing.signInFirst : plan === "pro" ? m.pricing.manage : m.pricing.upgrade;
  const primary = plan !== "pro";
  return (
    <div className={className}>
      <button
        type="button"
        onClick={run}
        disabled={busy || (!available && plan !== "pro")}
        className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-medium transition-[transform,opacity,background-color] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
          primary ? "bg-accent text-accent-ink" : "border border-line hover:bg-surface-2"
        }`}
      >
        {primary && <Lightning size={18} weight="fill" aria-hidden />}
        {busy ? m.pricing.redirecting : label}
      </button>
      {error != null && (
        <p className="mt-2 text-sm text-high" role="alert">
          {errorText(error, m)}
        </p>
      )}
    </div>
  );
}

export function formatPrice(price: NonNullable<BillingInfo["price"]>, tag: string) {
  return new Intl.NumberFormat(tag, {
    style: "currency",
    currency: price.currency.toUpperCase(),
    maximumFractionDigits: Number.isInteger(price.amount) ? 0 : 2,
  }).format(price.amount);
}

// Account page: current plan with renewal date and the billing button.
export function PlanCard() {
  const { m, locale } = useI18n();
  const { info } = useBilling(true);
  const tag = LOCALE_INFO[locale].tag;
  const date = (iso: string) => new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

  if (!info) return <div className="h-[104px] rounded-2xl bg-surface shadow-panel" aria-busy="true" aria-label={m.common.loading} />;

  const sub = info.subscription;
  const pro = info.plan === "pro";
  return (
    <section className="rounded-2xl bg-surface p-6 shadow-panel" aria-labelledby="plan-heading">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1">
          <h2 id="plan-heading" className="text-sm font-medium text-muted">
            {m.billing.title}
          </h2>
          <p className="mt-1 flex items-center gap-2 font-display text-xl font-medium tracking-[-0.02em]">
            {pro && <Crown size={20} weight="fill" className="text-accent" aria-hidden />}
            {pro ? m.pricing.pro : m.pricing.free}
          </p>
          {sub?.status === "past_due" ? (
            <p className="mt-1 text-sm text-high">{m.billing.pastDue}</p>
          ) : sub?.currentPeriodEnd ? (
            <p className="mt-1 text-sm text-muted">
              {sub.cancelAtPeriodEnd ? m.billing.cancels(date(sub.currentPeriodEnd)) : m.billing.renews(date(sub.currentPeriodEnd))}
            </p>
          ) : (
            <Link href="/pricing" className="mt-1 inline-flex items-center gap-1 text-sm text-accent underline-offset-4 hover:underline">
              {m.billing.seePlans}
              <ArrowRight size={14} aria-hidden />
            </Link>
          )}
        </div>
        <PlanButton plan={info.plan} available={info.price !== null} className="w-full sm:w-auto" />
      </div>
    </section>
  );
}

// Under a "daily limit reached" error on the free plan.
export function QuotaUpsell({ error }: { error: unknown }) {
  const { m } = useI18n();
  if (!(error instanceof ApiError) || error.code !== "quota" || error.params.upgrade !== 1) return null;
  return (
    <Link href="/pricing" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline">
      <Lightning size={15} weight="fill" aria-hidden />
      {m.billing.upsell}
    </Link>
  );
}
