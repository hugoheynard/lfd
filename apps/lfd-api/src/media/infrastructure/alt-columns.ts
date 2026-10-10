import {
  localizedColumn,
  readOptionalLocalizedColumn,
} from "../../platform/i18n/localized-text.js";
import { MEDIA_LANGUAGES, type LocalizedText } from "../domain/value-objects/alt-text.js";

/** Relit la colonne `alt` d'une image : `null` si absente, illisible ou sans langue source. */
export function readAltColumn(value: unknown): LocalizedText | null {
  return readOptionalLocalizedColumn(MEDIA_LANGUAGES, value);
}

/** Le texte alternatif, prêt à ranger en `jsonb`. */
export function altColumn(text: LocalizedText): Record<string, string> {
  return localizedColumn(MEDIA_LANGUAGES, text);
}
