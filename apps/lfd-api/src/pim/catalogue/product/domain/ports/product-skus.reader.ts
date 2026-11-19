/**
 * **Le SKU de fiches et de déclinaisons, par identifiant** — ce que la fiche
 * publie pour qu'un écran voisin nomme une cible qu'il vise sans lire ses
 * tables. Un identifiant introuvable est absent.
 */
export abstract class ProductSkusReader {
  abstract productSkusOf(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
  abstract variantSkusOf(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
