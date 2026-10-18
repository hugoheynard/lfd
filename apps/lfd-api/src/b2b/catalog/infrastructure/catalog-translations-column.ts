import { contentLocales } from "@lfd/contracts";

import {
  CATALOG_SOURCE_LANGUAGE,
  NO_TRANSLATIONS,
  type CatalogTranslations,
  type TranslatedLanguage,
} from "../domain/catalog-translations.js";

/** Les langues que la colonne peut porter — celles de la boutique, sauf la source. */
const TRANSLATED: readonly TranslatedLanguage[] = contentLocales.filter(
  (language): language is TranslatedLanguage => language !== CATALOG_SOURCE_LANGUAGE,
);

/**
 * **Une colonne `*_translations` relue** (lot des langues, 2026-10-18).
 *
 * `NULL` (rien reçu), une valeur hors forme ou une langue inconnue se lisent
 * « rien de traduit » : la vitrine sert alors le français, plutôt que de
 * tomber sur une lecture de rayon. Seul le récepteur des faits écrit ces
 * colonnes, depuis un fait déjà validé à la forme ; ce repli ne couvre donc
 * qu'une écriture à la main.
 */
export function translationsColumnOf(raw: unknown): CatalogTranslations {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return NO_TRANSLATIONS;
  }
  const entries = new Map(Object.entries(raw));
  const translations: Partial<Record<TranslatedLanguage, string>> = {};
  for (const language of TRANSLATED) {
    const value: unknown = entries.get(language);
    if (typeof value === "string" && value.length > 0) {
      translations[language] = value;
    }
  }
  return translations;
}
