"use client";

import { ArrowLeft, CheckCircle, SignOut, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LOCALE_INFO } from "@/lib/i18n";
import { Avatar, SignInForm, useAccount } from "./account";
import { PlanCard } from "./billing";
import { HistoryList } from "./history-drawer";
import { useI18n } from "./i18n";
import { del, errorText, get, post, type UsageKind, type UsageSummary } from "./shared";

const KINDS: UsageKind[] = ["analyze", "hooks", "rewrite"];

// Flags the sign-in callback leaves in the URL; read once, then removed.
function useAuthFlags() {
  const [flags, setFlags] = useState({ welcome: false, failed: false, upgraded: false });
  useEffect(() => {
    const url = new URL(window.location.href);
    const next = {
      welcome: url.searchParams.has("signed_in"),
      failed: url.searchParams.has("auth_error"),
      upgraded: url.searchParams.has("upgraded"),
    };
    if (next.welcome || next.failed || next.upgraded) {
      // Reading the URL has to wait for mount to avoid a hydration mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFlags(next);
      window.history.replaceState(null, "", url.pathname);
    }
  }, []);
  return flags;
}

export function AccountView() {
  const { m } = useI18n();
  const { me, loading } = useAccount();
  const flags = useAuthFlags();

  return (
    <div className="mx-auto max-w-[720px] pt-4">
      <Link href="/" className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} aria-hidden />
        {m.account.back}
      </Link>
      <h1 className="mt-4 font-display text-[28px] font-medium tracking-[-0.03em]">{m.account.title}</h1>

      {flags.welcome && me && <Banner tone="ok">{m.account.welcome}</Banner>}
      {flags.failed && <Banner tone="error">{m.account.authError}</Banner>}
      {flags.upgraded && <Banner tone="ok">{m.billing.upgraded}</Banner>}

      <div className="mt-6 space-y-5">
        {loading ? (
          <div className="h-[132px] rounded-2xl bg-surface shadow-panel" aria-busy="true" aria-label={m.common.loading} />
        ) : me ? (
          <>
            <Profile />
            <PlanCard />
          </>
        ) : (
          <section className="rounded-2xl bg-surface p-6 shadow-panel" aria-labelledby="guest-heading">
            <h2 id="guest-heading" className="font-display text-lg font-medium tracking-[-0.02em]">
              {m.account.guestTitle}
            </h2>
            <p className="mb-6 mt-2 max-w-[56ch] text-[15px] leading-relaxed text-muted">{m.account.guestBody}</p>
            <div className="max-w-[380px]">
              <SignInForm />
            </div>
          </section>
        )}

        <Usage />

        <section className="overflow-hidden rounded-2xl bg-surface shadow-panel" aria-labelledby="checks-heading">
          <h2 id="checks-heading" className="border-b border-line px-5 py-4 font-display text-[15px] font-medium tracking-[-0.01em]">
            {m.account.historyTitle}
          </h2>
          <HistoryList />
        </section>

        {me && <DangerZone />}
      </div>
    </div>
  );
}

function Banner({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle : WarningCircle;
  return (
    <div
      role={tone === "ok" ? "status" : "alert"}
      className={`mt-5 flex gap-3 rounded-2xl border px-5 py-4 text-[15px] ${
        tone === "ok" ? "border-low/30 bg-low-soft" : "border-high/30 bg-high-soft"
      }`}
    >
      <Icon size={20} weight="fill" className={`mt-0.5 shrink-0 ${tone === "ok" ? "text-low" : "text-high"}`} aria-hidden />
      <p>{children}</p>
    </div>
  );
}

function Profile() {
  const { m, locale } = useI18n();
  const { me } = useAccount();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!me) return null;

  async function signOut() {
    setSigningOut(true);
    setError(null);
    try {
      await post("/api/auth/signout", {});
      // Full reload, not router.push: every piece of client state belonged to this account.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch (e) {
      setError(e);
      setSigningOut(false);
    }
  }

  const since = new Intl.DateTimeFormat(LOCALE_INFO[locale].tag, { day: "numeric", month: "long", year: "numeric" }).format(new Date(me.createdAt));

  return (
    <section className="rounded-2xl bg-surface p-6 shadow-panel" aria-label={m.account.title}>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar me={me} size={56} />
        <div className="min-w-0 flex-1">
          {me.name && <p className="truncate text-[17px] font-medium">{me.name}</p>}
          <p className={`truncate ${me.name ? "text-[15px] text-muted" : "text-[17px] font-medium"}`}>{me.email}</p>
          <p className="mt-1 text-[13px] text-faint">
            {m.account.via[me.provider]} · {m.account.since(since)}
          </p>
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium transition-colors duration-150 hover:bg-surface-2 disabled:opacity-50"
        >
          <SignOut size={17} aria-hidden />
          {signingOut ? m.account.signingOut : m.account.signOut}
        </button>
      </div>
      {error != null && (
        <p className="mt-3 text-sm text-high" role="alert">
          {errorText(error, m)}
        </p>
      )}
    </section>
  );
}

function Usage() {
  const { m } = useI18n();
  const [usage, setUsage] = useState<UsageSummary | null>(null);

  useEffect(() => {
    get<UsageSummary>("/api/usage")
      .then(setUsage)
      .catch(() => setUsage(null));
  }, []);

  return (
    <section className="rounded-2xl bg-surface p-6 shadow-panel" aria-labelledby="usage-heading">
      <h2 id="usage-heading" className="font-display text-[15px] font-medium tracking-[-0.01em]">
        {m.account.usageTitle}
      </h2>
      <dl className="mt-4 space-y-4">
        {KINDS.map((kind) => {
          const u = usage?.[kind];
          const ratio = u ? Math.min(1, u.used / u.limit) : 0;
          const full = u ? u.used >= u.limit : false;
          return (
            <div key={kind}>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[15px]">{m.account.usageKinds[kind]}</dt>
                <dd className={`font-mono text-[13px] tabular ${full ? "text-high" : "text-muted"}`}>
                  {u ? `${u.used} / ${u.limit}` : "–"}
                </dd>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ease-out-quint ${full ? "bg-high" : "bg-accent"}`}
                  style={{ width: `${ratio * 100}%` }}
                />
              </div>
              {full && u?.resetInHours != null && <p className="mt-1.5 text-[13px] text-high">{m.limits.reached(u.resetInHours)}</p>}
            </div>
          );
        })}
      </dl>
      <p className="mt-5 text-[13px] leading-relaxed text-faint">{m.account.usageNote}</p>
    </section>
  );
}

function DangerZone() {
  const { m } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await del("/api/me");
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch (e) {
      setError(e);
      setDeleting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-high/25 bg-surface p-6 shadow-panel" aria-labelledby="delete-heading">
      <h2 id="delete-heading" className="font-display text-[15px] font-medium tracking-[-0.01em]">
        {m.account.deleteTitle}
      </h2>
      <p className="mt-1.5 max-w-[56ch] text-sm leading-relaxed text-muted">{m.account.deleteBody}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="inline-flex h-10 items-center rounded-xl bg-high px-4 text-sm font-medium text-accent-ink transition-transform duration-150 active:scale-[0.98] disabled:opacity-50"
            >
              {deleting ? m.account.deleting : m.account.deleteConfirm}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="inline-flex h-10 items-center rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface-2"
            >
              {m.account.cancel}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex h-10 items-center rounded-xl border border-high/40 px-4 text-sm font-medium text-high transition-colors duration-150 hover:bg-high-soft"
          >
            {m.account.delete}
          </button>
        )}
      </div>
      {error != null && (
        <p className="mt-3 text-sm text-high" role="alert">
          {errorText(error, m)}
        </p>
      )}
    </section>
  );
}
