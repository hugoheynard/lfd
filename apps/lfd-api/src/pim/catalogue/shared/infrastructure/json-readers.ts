import {
  localizedColumn as localizedColumnOf,
  readLocalizedColumn as readLocalizedColumnOf,
  readOptionalLocalizedColumn,
} from "../../../../platform/i18n/localized-text.js";
import { CATALOGUE_LANGUAGES, type LocalizedText } from "../domain/value-objects/localized-text.js";

/**
 * Les colonnes `jsonb` du référentiel, lues et écrites dans SES langues.
 *
 * La mécanique est en `platform/` depuis le 2026-10-10 (`database/json-columns`,
 * `i18n/localized-text`) : rien n'y parlait de catalogue, et la médiathèque
 * l'empruntait ici. Ce fichier ne fait plus que lier la liste des langues du
 * catalogue — ses lecteurs n'ont pas eu à changer d'import.
 */
export {
  CorruptedRecordError,
  isUniqueViolation,
  readStringArrayColumn,
  readStringMapColumn,
  violatedConstraint,
} from "../../../../platform/database/json-columns.js";

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
