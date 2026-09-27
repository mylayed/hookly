import { de } from "./dictionaries/de";
import { en, type Messages } from "./dictionaries/en";
import { es } from "./dictionaries/es";
import { fr } from "./dictionaries/fr";
import { pl } from "./dictionaries/pl";
import { pt } from "./dictionaries/pt";
import { uk } from "./dictionaries/uk";
import type { Locale } from "./locales";

export * from "./locales";
export type { Messages };

export const DICTIONARIES: Record<Locale, Messages> = { en, uk, es, pt, fr, de, pl };

export function getMessages(locale: Locale): Messages {
  return DICTIONARIES[locale];
}
