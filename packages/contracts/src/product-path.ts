/**
 * **L'adresse d'une fiche article** — `/boutique/article/<sku>` (Hugo,
 * 2026-10-23 : une adresse stable pour toujours, par le SKU seul).
 *
 * UNE fonction pour ses deux lecteurs : la boutique, qui y navigue en ouvrant
 * une fiche et la déclare canonique, et le flux de la vitrine
 * (`<URLProduct>`), qui la publie. Deux constructions se seraient séparées au
 * premier changement.
 *
 * Sans dépendance (ni zod) : la boutique l'importe par son sous-chemin
 * `@lfd/contracts/product-path`, sans embarquer le baril.
 */

/** Le préfixe de la boutique, sans barre finale. */
export const SHOP_PATH = "/boutique";

/** Le segment qui précède le SKU d'une fiche. */
export const PRODUCT_SEGMENT = "article";

/** Le chemin d'une fiche : `/boutique/article/<sku>`, SKU encodé. */
export function productPath(sku: string): string {
  return `${SHOP_PATH}/${PRODUCT_SEGMENT}/${encodeURIComponent(sku)}`;
}

/**
 * L'URL absolue d'une fiche, ou `null` sans origine connue : une adresse sans
 * hôte ne se partage pas, et on n'en invente pas.
 */
export function productUrl(origin: string | null, sku: string): string | null {
  if (origin === null || origin === "") {
    return null;
  }
  return `${origin.replace(/\/+$/, "")}${productPath(sku)}`;
}
