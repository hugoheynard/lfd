import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";

/**
 * Lecture des textes d'une famille — surface **séparée** de l'écriture : un
 * consommateur qui lit ne dépend pas du `save`. `null` = non renseigné.
 *
 * Rendus dans TOUTES leurs langues. C'est au lecteur qui vise une langue
 * d'appeler `readLocalized`, parce que lui seul sait laquelle il vise ; aplatir
 * ici priverait de traduction jusqu'à celui qui voulait l'italien.
 */
export interface CategoryEditorialView {
  readonly descriptionShort: LocalizedText | null;
  readonly descriptionLong: LocalizedText | null;
  readonly seoTitle: LocalizedText | null;
  readonly seoDescription: LocalizedText | null;
}

/**
 * Un visuel attaché, à plat et dans l'ordre d'affichage.
 *
 * Les dimensions accompagnent l'URL parce qu'elles ne servent qu'ensemble :
 * sans elles, l'écran ne peut pas réserver la place du visuel et la page saute
 * au chargement. `null` = pas mesuré (visuel saisi par son URL), jamais zéro.
 */
export interface CategoryMediaRecord {
  readonly role: string;
  readonly url: string;
  /** L'étiquette de la bibliothèque ; `''` = pas nommé. */
  readonly name: string;
  readonly alt: LocalizedText;
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number | null;
  readonly contentType: string | null;
}

export abstract class CategoryEditorialReader {
  abstract findByCategory(categoryId: string): Promise<CategoryEditorialView | null>;
  abstract mediaOf(categoryId: string): Promise<readonly CategoryMediaRecord[]>;
}
