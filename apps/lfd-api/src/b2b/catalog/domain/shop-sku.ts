/**
 * **Le SKU de vente d'un article** — celui que la vitrine montre, que le
 * panier, le devis et `POST /orders` renvoient
 * (`documentation/catalogue/plan-declinaisons-en-vignette.md`, V4).
 *
 * La déclinaison par défaut se vend sous le SKU de son PRODUIT, comme depuis
 * l'ouverture commerciale : les commandes passées le portent. Une autre
 * déclinaison — vendue seulement quand sa fiche montre chaque déclinaison en
 * vignette — se vend sous son propre SKU. Les deux espaces ne se recouvrent
 * pas : le registre du référentiel (`pim.sku_registry`) tient produits et
 * déclinaisons dans une seule table unique.
 */
export function shopSkuOf(item: {
  readonly sku: string;
  readonly productSku: string;
  readonly isDefault: boolean;
}): string {
  return item.isDefault ? item.productSku : item.sku;
}

/**
 * **L'article paraît-il au rayon ?** Le défaut toujours ; une autre
 * déclinaison seulement quand sa fiche montre chaque déclinaison (V1).
 */
export function isShownAsTile(item: {
  readonly isDefault: boolean;
  readonly variantsAsTiles: boolean;
}): boolean {
  return item.isDefault || item.variantsAsTiles;
}

/** Ce qui sépare le nom de la fiche de celui de la déclinaison. */
const NAME_SEPARATOR = " — ";

/**
 * **Le nom d'un article en vente** (V5) : celui de la déclinaison pour le
 * défaut, comme avant ; « fiche — déclinaison » pour une autre, que la vitrine,
 * le devis et la ligne de commande portent alors tous trois.
 *
 * 🔴 Le nom de la fiche manque (`null`) sur tout article reçu avant le fil
 * v16, jusqu'à la réémission de sa fiche : le nom de la déclinaison est alors
 * servi SEUL — jamais « null — 220 g », et jamais un nom inventé. Il manque
 * aussi quand la déclinaison porte déjà le nom de la fiche : pas de doublon.
 */
export function shopItemName(
  variantName: string,
  productName: string | null,
  isDefault: boolean,
): string {
  if (
    isDefault ||
    productName === null ||
    productName.trim() === "" ||
    productName === variantName
  ) {
    return variantName;
  }
  return `${productName}${NAME_SEPARATOR}${variantName}`;
}
