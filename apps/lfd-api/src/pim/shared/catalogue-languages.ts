import { LOCALES, SOURCE_LOCALE, type Locale } from "@lfd/pim-contracts";
import type { Languages } from "../../platform/i18n/localized-text.js";

/**
 * Les langues du catalogue, en DONNÉE — ce que la mécanique de `platform/`
 * boucle sans les connaître (la liste est un contrat métier, que la plateforme
 * n'importe pas).
 *
 * Elle vit dans le noyau parce que les référentiels lisent leurs colonnes
 * localisées dans ces langues sans avoir le droit d'importer le catalogue ;
 * `catalogue/shared/domain/value-objects/localized-text.ts` la ré-exporte.
 */
export const CATALOGUE_LANGUAGES: Languages<typeof SOURCE_LOCALE, Locale> = {
  source: SOURCE_LOCALE,
  all: LOCALES,
};
