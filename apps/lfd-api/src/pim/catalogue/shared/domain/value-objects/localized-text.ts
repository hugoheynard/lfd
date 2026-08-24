import { DomainError } from "../../../../../platform/shared/errors/app-error.js";
import {
  LOCALES,
  SOURCE_LOCALE,
  type Locale,
  type LocalizedText,
  type TranslatedLocale,
} from "@lfd/pim-contracts";

/** Les langues à traduire, calculées une fois depuis la liste. */
const TRANSLATED_LOCALES = LOCALES.filter(
  (locale): locale is TranslatedLocale => locale !== SOURCE_LOCALE,
);

export type { Locale, LocalizedText, TranslatedLocale };
export { LOCALES, SOURCE_LOCALE };

export class InvalidLocalizedTextError extends DomainError {
  constructor(field: string) {
    super(
      "catalogue.localized_text.invalid",
      `Le champ « ${field} » doit avoir une valeur en ${SOURCE_LOCALE}.`,
    );
  }
}

/**
 * Construit un texte traduisible à partir d'une carte de locales.
 *
 * Une CARTE, et non plus `(fr, en?)` : la signature positionnelle imposait
 * d'ajouter un paramètre par langue, à chaque appelant, dans le bon ordre. La
 * carte se boucle sur {@link LOCALES} — ouvrir une langue ne touche donc ni
 * cette fonction ni personne qui l'appelle.
 *
 * Les valeurs sont rognées, et une chaîne vide est traitée comme ABSENTE : une
 * traduction vide n'est pas une traduction, et la garder ferait passer la fiche
 * pour traduite auprès de tout ce qui compte les locales renseignées.
 */
export function localizedText(
  field: string,
  values: Partial<Record<Locale, string | undefined>>,
): LocalizedText {
  const source = (values[SOURCE_LOCALE] ?? "").trim();
  if (source === "") {
    throw new InvalidLocalizedTextError(field);
  }

  const translations: Partial<Record<TranslatedLocale, string>> = {};
  for (const locale of TRANSLATED_LOCALES) {
    const translated = (values[locale] ?? "").trim();
    if (translated !== "") {
      translations[locale] = translated;
    }
  }
  return { [SOURCE_LOCALE]: source, ...translations };
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
