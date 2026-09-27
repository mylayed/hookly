// Locale list shared by the server (layout, API routes) and the client.
// `promptName` is the language the model writes feedback in; `address` is how it
// speaks to the creator, matching the register of that locale's UI copy.

export const LOCALES = ["en", "uk", "es", "pt", "fr", "de", "pl"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "hookcheck-locale";

export const LOCALE_INFO: Record<
  Locale,
  { native: string; tag: string; promptName: string; address: string }
> = {
  en: { native: "English", tag: "en", promptName: "English", address: "you" },
  uk: { native: "Українська", tag: "uk", promptName: "Ukrainian", address: "formal «ви» (e.g. «Додайте», not «Додай»)" },
  es: { native: "Español", tag: "es", promptName: "Spanish", address: "informal «tú»" },
  pt: { native: "Português", tag: "pt-BR", promptName: "Brazilian Portuguese", address: "«você»" },
  fr: { native: "Français", tag: "fr", promptName: "French", address: "formal «vous»" },
  de: { native: "Deutsch", tag: "de", promptName: "German", address: "informal «du»" },
  pl: { native: "Polski", tag: "pl", promptName: "Polish", address: "informal «ty» (e.g. «Dodaj»)" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

// Picks the best supported locale from an Accept-Language header.
export function matchLocale(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { base: tag.toLowerCase().split("-")[0], q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { base } of ranked) {
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
