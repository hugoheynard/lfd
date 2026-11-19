import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";

/** Une famille de la chaîne : son identifiant et son nom. */
export interface CategoryChainLink {
  readonly id: string;
  readonly name: LocalizedText;
}

/**
 * **Une famille, puis ses ancêtres jusqu'à la racine**, dans cet ordre.
 *
 * Bornée en profondeur et arrêtée au premier retour : une boucle en base rend
 * une chaîne finie, jamais une attente. Une famille inconnue rend `[]`.
 */
export abstract class CategoryChainReader {
  abstract chainOf(categoryId: string): Promise<readonly CategoryChainLink[]>;
}
