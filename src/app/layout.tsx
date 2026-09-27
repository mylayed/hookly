import type { Metadata } from "next";
import { JetBrains_Mono, Onest, Unbounded } from "next/font/google";
import { AccountProvider } from "@/components/account";
import { I18nProvider } from "@/components/i18n";
import { getMessages, LOCALE_INFO } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import "./globals.css";

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "latin-ext", "cyrillic"],
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["500", "700"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = getMessages(await getRequestLocale());
  return { title: meta.title, description: meta.description };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getRequestLocale();
  return (
    <html lang={LOCALE_INFO[locale].tag} className={`${onest.variable} ${unbounded.variable} ${jetbrains.variable} h-full`}>
      <body className="min-h-full">
        <I18nProvider initialLocale={locale}>
          <AccountProvider>{children}</AccountProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
