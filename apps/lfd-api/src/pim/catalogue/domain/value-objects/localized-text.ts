import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Texte traduisible — `fr` **obligatoire**, les autres locales optionnelles.
 *
 * Décision J1 : traduisible dès le départ (Val d'Isère = clientèle internationale),
 * mais le français fait foi et sert de repli. Stocké en `jsonb`.
 */
export interface LocalizedText {
  readonly fr: string;
  readonly en?: string;
}

export class InvalidLocalizedTextError extends DomainError {
  constructor(field: string) {
    super(
      "catalogue.localized_text.invalid",
      `Le champ « ${field} » doit avoir une valeur en français.`,
    );
  }
}

export function localizedText(field: string, fr: string, en?: string): LocalizedText {
  const trimmedFr = fr.trim();
  if (trimmedFr === "") {
    throw new InvalidLocalizedTextError(field);
  }

  const trimmedEn = en?.trim();
  return trimmedEn === undefined || trimmedEn === ""
    ? { fr: trimmedFr }
    : { fr: trimmedFr, en: trimmedEn };
}

/** Repli documenté : une locale absente retombe sur le français. */
export function readLocalized(text: LocalizedText, locale: string): string {
  return locale === "en" && text.en !== undefined ? text.en : text.fr;
}

/** `Tarte aux fraises` → `tarte-aux-fraises` — identifiant d'URL, pas une référence. */
export function slugify(source: string): string {
  return source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}
