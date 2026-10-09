import type { ContactLocalizedText } from "@lfd/contracts";

import { ContactTextTooLongError } from "./errors/contact-errors.js";

/** Un texte rogné de ses blancs, refusé au-delà de sa borne. */
export function boundedText(field: string, raw: string, max: number): string {
  const value = raw.trim();
  if (value.length > max) {
    throw new ContactTextTooLongError(field, max);
  }
  return value;
}

/** Un texte en trois langues, chaque langue rognée et bornée. Vide est permis. */
export function localizedText(
  field: string,
  raw: ContactLocalizedText,
  max: number,
): ContactLocalizedText {
  return {
    fr: boundedText(`${field} (fr)`, raw.fr, max),
    en: boundedText(`${field} (en)`, raw.en, max),
    it: boundedText(`${field} (it)`, raw.it, max),
  };
}
