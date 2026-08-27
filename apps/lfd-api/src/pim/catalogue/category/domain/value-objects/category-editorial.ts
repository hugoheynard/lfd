import {
  localizedText,
  SOURCE_LOCALE,
  type LocalizedText,
} from "../../../shared/domain/value-objects/localized-text.js";

/**
 * Ce qu'on DIT d'une famille — quatre textes, tous localisés.
 *
 * Quatre, et non les sept d'une fiche : un récit, un accord et une marque
 * parlent d'un produit, pas du rayon où on le range. Les copier aurait offert
 * trois champs que personne ne saurait remplir, et qu'un jour quelqu'un aurait
 * remplis de travers faute de savoir ce qu'on y attendait.
 */
export interface CategoryEditorial {
  readonly descriptionShort?: LocalizedText | undefined;
  readonly descriptionLong?: LocalizedText | undefined;
  readonly seoTitle?: LocalizedText | undefined;
  readonly seoDescription?: LocalizedText | undefined;
}

export type CategoryEditorialInput = CategoryEditorial;

/**
 * Un champ vide n'est pas une valeur : il ne doit pas créer de `{ fr: "" }`.
 *
 * L'entrée arrive déjà localisée, donc on la RECONSTRUIT plutôt que de la
 * recopier — `localizedText` est le seul endroit qui sait rogner, écarter une
 * traduction vide et exiger la langue source. La laisser passer telle quelle
 * ferait entrer en base ce qu'aucune autre porte ne laisserait entrer.
 */
function optionalText(field: string, raw: LocalizedText | undefined): LocalizedText | undefined {
  if (raw === undefined || (raw[SOURCE_LOCALE] ?? "").trim() === "") {
    return undefined;
  }
  return localizedText(field, raw);
}

export function categoryEditorial(input: CategoryEditorialInput): CategoryEditorial {
  return {
    descriptionShort: optionalText("résumé", input.descriptionShort),
    descriptionLong: optionalText("description", input.descriptionLong),
    seoTitle: optionalText("titre SEO", input.seoTitle),
    seoDescription: optionalText("description SEO", input.seoDescription),
  };
}

/** Rien de renseigné ⇒ pas de ligne du tout (satellite optionnel, ADR-13). */
export function isEmptyCategoryEditorial(value: CategoryEditorial): boolean {
  return Object.values(value).every((entry) => entry === undefined);
}
