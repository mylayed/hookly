import type { Metadata } from "next";
import { AccountView } from "@/components/account-view";
import { SiteHeader } from "@/components/site-header";
import { getMessages } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = getMessages(await getRequestLocale());
  return { title: `${m.account.title} · Hookly`, robots: { index: false } };
}

export default function AccountPage() {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pb-16 sm:px-6">
      <SiteHeader pageTitle={false} />
      <main>
        <AccountView />
      </main>
    </div>
  );
}
