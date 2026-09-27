"use client";

import { EnvelopeSimple, GoogleLogo, SignIn, X } from "@phosphor-icons/react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useI18n } from "./i18n";
import { errorText, get, post, type Me } from "./shared";

// Who is signed in. Guests (no session, or an anonymous one) get null.
interface AccountState {
  me: Me | null;
  loading: boolean;
  openSignIn: () => void;
}

const AccountContext = createContext<AccountState | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [signInOpen, setSignInOpen] = useState(false);

  useEffect(() => {
    get<{ user: Me | null }>("/api/me")
      .then(({ user }) => setMe(user))
      .catch(() => setMe(null))
      .finally(() => setLoading(false));

    // The sign-in callback adds ?signed_in=1; the account page reads it for its
    // welcome note, everywhere else it would just clutter the URL.
    const url = new URL(window.location.href);
    if (url.searchParams.has("signed_in") && url.pathname !== "/account") {
      url.searchParams.delete("signed_in");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, []);

  const openSignIn = useCallback(() => setSignInOpen(true), []);
  const closeSignIn = useCallback(() => setSignInOpen(false), []);

  return (
    <AccountContext.Provider value={{ me, loading, openSignIn }}>
      {children}
      {signInOpen && <SignInDialog onClose={closeSignIn} />}
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountState {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside <AccountProvider>");
  return ctx;
}

export function Avatar({ me, size = 36 }: { me: Me; size?: number }) {
  const initial = (me.name ?? me.email ?? "?").trim().charAt(0).toUpperCase();
  return me.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- avatars come from Google's CDN; no need for the image optimizer
    <img src={me.avatarUrl} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-full bg-surface-2 object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-accent font-display font-bold text-accent-ink"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}

// Header control: avatar linking to the account page, or a sign-in button.
export function AccountButton() {
  const { m } = useI18n();
  const { me, loading, openSignIn } = useAccount();
  if (loading) return <span className="h-9 w-9 rounded-full bg-surface-2" aria-hidden />;
  if (me) {
    return (
      <Link href="/account" aria-label={`${m.header.account}: ${me.email ?? me.name ?? ""}`} className="rounded-full">
        <Avatar me={me} />
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={openSignIn}
      className="inline-flex h-9 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-medium text-accent-ink transition-transform duration-150 active:scale-[0.98]"
    >
      <SignIn size={16} weight="bold" aria-hidden />
      {m.header.signIn}
    </button>
  );
}

// Where to come back after signing in: the page the visitor is on now.
function currentPath() {
  return window.location.pathname + window.location.search;
}

// Google button + email link form. Used in the dialog and inline on the account page.
export function SignInForm() {
  const { m } = useI18n();
  const [email, setEmail] = useState("");
  // Address the link went to; the form swaps to the "check your inbox" view.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const emailId = useId();

  async function send(address: string) {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await post("/api/auth/email", { email: address, next: currentPath() });
      if (sentTo) setResent(true);
      setSentTo(address);
    } catch (err) {
      setError(err);
    } finally {
      setSending(false);
    }
  }

  if (sentTo) {
    return (
      <div role="status">
        <EnvelopeSimple size={28} className="text-accent" aria-hidden />
        <p className="mt-3 font-display text-[17px] font-medium tracking-[-0.02em]">{m.auth.sentTitle}</p>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{m.auth.sent(sentTo)}</p>
        {error != null && (
          <p className="mt-3 text-sm text-high" role="alert">
            {errorText(error, m)}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => send(sentTo)}
            disabled={sending || resent}
            className="inline-flex h-10 items-center rounded-xl border border-line px-4 text-sm font-medium transition-colors duration-150 hover:bg-surface-2 disabled:opacity-50"
          >
            {sending ? m.auth.sending : resent ? m.auth.resent : m.auth.resend}
          </button>
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setResent(false);
              setError(null);
            }}
            className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-accent transition-colors duration-150 hover:bg-accent-soft"
          >
            {m.auth.otherEmail}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <a
        href="/api/auth/google"
        onClick={(e) => {
          // The return path is read at click time so server and client render the same markup.
          e.currentTarget.href = `/api/auth/google?next=${encodeURIComponent(currentPath())}`;
        }}
        className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-surface text-[15px] font-medium transition-colors duration-150 hover:bg-surface-2"
      >
        <GoogleLogo size={18} weight="bold" aria-hidden />
        {m.auth.google}
      </a>

      <div className="my-5 flex items-center gap-3 text-[13px] text-faint" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        {m.auth.or}
        <span className="h-px flex-1 bg-line" />
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          send(email.trim());
        }}
      >
        <label htmlFor={emailId} className="mb-2 block text-sm font-medium text-muted">
          {m.auth.email}
        </label>
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        {error != null && (
          <p className="mt-2 text-sm text-high" role="alert">
            {errorText(error, m)}
          </p>
        )}
        <button
          type="submit"
          disabled={sending || !email.trim()}
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[15px] font-medium text-accent-ink transition-[transform,opacity] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <EnvelopeSimple size={18} weight="bold" aria-hidden />
          {sending ? m.auth.sending : m.auth.send}
        </button>
      </form>
    </div>
  );
}

function SignInDialog({ onClose }: { onClose: () => void }) {
  const { m } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
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
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="drawer-scrim absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="dialog relative w-full max-w-[420px] rounded-2xl border border-line bg-surface p-6 shadow-menu focus:outline-none"
      >
        <button type="button" onClick={onClose} aria-label={m.auth.close} className="absolute right-3 top-3 rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink">
          <X size={18} aria-hidden />
        </button>
        <h2 id={titleId} className="pr-8 font-display text-xl font-medium tracking-[-0.02em]">
          {m.auth.title}
        </h2>
        <p className="mb-6 mt-2 text-[15px] leading-relaxed text-muted">{m.auth.subtitle}</p>
        <SignInForm />
      </div>
    </div>
  );
}
