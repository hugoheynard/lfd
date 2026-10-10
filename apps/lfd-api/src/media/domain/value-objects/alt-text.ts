import { LOCALES, SOURCE_LOCALE, type Locale, type LocalizedText } from "@lfd/pim-contracts";

import { buildLocalized, type Languages } from "../../../platform/i18n/localized-text.js";

export type { LocalizedText };
export { SOURCE_LOCALE };

/**
 * Les langues dans lesquelles une image se décrit.
 *
 * Ce sont celles du catalogue, lues dans le CONTRAT (`@lfd/pim-contracts`) et
 * non dans le bloc `pim/` : la médiathèque les empruntait au référentiel
 * jusqu'au 2026-10-10, ce qui ouvrait `media→pim` sur le bloc entier pour une
 * liste de trois langues. La mécanique est en `platform/i18n/`.
 */
export const MEDIA_LANGUAGES: Languages<typeof SOURCE_LOCALE, Locale> = {
  source: SOURCE_LOCALE,
  all: LOCALES,
};

/** Le texte alternatif d'une image : la langue source obligatoire, les autres facultatives. */
export function altText(
  field: string,
  values: Partial<Record<Locale, string | undefined>>,
): LocalizedText {
  return buildLocalized(MEDIA_LANGUAGES, field, values);
}
