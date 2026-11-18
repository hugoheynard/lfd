import {
  buildLocalized,
  InvalidLocalizedTextError,
} from "../../../../../platform/i18n/localized-text.js";
import { CATALOGUE_LANGUAGES } from "../../../../shared/catalogue-languages.js";
import {
  LOCALES,
  SOURCE_LOCALE,
  type Locale,
  type LocalizedText,
  type TranslatedLocale,
} from "@lfd/pim-contracts";

export type { Locale, LocalizedText, TranslatedLocale };
export { CATALOGUE_LANGUAGES, InvalidLocalizedTextError, LOCALES, SOURCE_LOCALE };

/**
 * Construit un texte traduisible à partir d'une carte de langues.
 *
 * Une CARTE, et non `(fr, en?)` : la signature positionnelle imposait
 * d'ajouter un paramètre par langue, à chaque appelant, dans le bon ordre.
 */
export function localizedText(
  field: string,
  values: Partial<Record<Locale, string | undefined>>,
): LocalizedText {
  return buildLocalized(CATALOGUE_LANGUAGES, field, values);
}

/** Repli documenté : une locale absente retombe sur la langue source. */
export function readLocalized(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text[SOURCE_LOCALE];
}

/** `Tarte aux fraises` → `tarte-aux-fraises` — identifiant d'URL, pas une référence. */
export function slugify(source: string): string {
  return source
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}
