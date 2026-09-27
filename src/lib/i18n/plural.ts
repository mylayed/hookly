type Forms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

const rulesCache = new Map<string, Intl.PluralRules>();

// Picks the CLDR plural form for n and replaces "#" with the number.
// Ukrainian and Polish need one/few/many; English only one/other.
export function plural(locale: string, n: number, forms: Forms): string {
  let rules = rulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    rulesCache.set(locale, rules);
  }
  const form = forms[rules.select(n)] ?? forms.other;
  return form.replace("#", String(n));
}
