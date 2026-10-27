import type { AllergenTexts, AllergenTextsByLanguage } from "../domain/shop-allergens.js";

/**
 * **Les libellés par langue relus depuis `jsonb`** — la règle
 * d'`allergenLabelsOf` : une entrée illisible fait tomber la carte entière
 * (`null`, « je ne sais pas »), elle n'est pas écartée en silence. Une langue
 * amputée se lirait sinon comme une liste complète.
 */
export function allergenTextsOf(raw: unknown): AllergenTextsByLanguage | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const byLanguage: Record<string, AllergenTexts> = {};
  for (const [language, entry] of Object.entries(raw)) {
    const texts = textsOf(entry);
    if (texts === null) {
      return null;
    }
    byLanguage[language] = texts;
  }
  return byLanguage;
}

function textsOf(raw: unknown): AllergenTexts | null {
  if (typeof raw !== "object" || raw === null || !("contains" in raw) || !("mayContain" in raw)) {
    return null;
  }
  const { contains, mayContain } = raw;
  return isLabelList(contains) && isLabelList(mayContain) ? { contains, mayContain } : null;
}

function isLabelList(raw: unknown): raw is string[] {
  return Array.isArray(raw) && raw.every((label) => typeof label === "string" && label !== "");
}
