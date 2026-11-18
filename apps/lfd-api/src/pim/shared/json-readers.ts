import {
  localizedColumn as localizedColumnOf,
  readLocalizedColumn as readLocalizedColumnOf,
  readOptionalLocalizedColumn,
} from "../../platform/i18n/localized-text.js";
import type { LocalizedText } from "@lfd/pim-contracts";
import { CATALOGUE_LANGUAGES } from "./catalogue-languages.js";

/**
 * Les colonnes `jsonb` du référentiel, lues et écrites dans SES langues.
 *
 * La mécanique est dans `platform/` (`database/json-columns`, `i18n/localized-text`) :
 * rien n'y parle de catalogue. Ce fichier lie la liste des langues du catalogue
 * et vit dans le noyau pour que les référentiels le lisent sans importer le catalogue.
 */
export {
  CorruptedRecordError,
  isUniqueViolation,
  readStringArrayColumn,
  readStringMapColumn,
  violatedConstraint,
} from "../../platform/database/json-columns.js";

export function readLocalizedColumn(value: unknown, field: string): LocalizedText {
  return readLocalizedColumnOf(CATALOGUE_LANGUAGES, value, field);
}

/** Une colonne localisée facultative : `null` si absente, illisible ou sans langue source. */
export function optionalLocalizedColumn(value: unknown): LocalizedText | null {
  return readOptionalLocalizedColumn(CATALOGUE_LANGUAGES, value);
}

export function localizedColumn(text: LocalizedText): Record<string, string> {
  return localizedColumnOf(CATALOGUE_LANGUAGES, text);
}
