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

/**
 * **Le nom d'un article en vente** : celui de la déclinaison, seul, pour le
 * défaut comme pour les autres.
 *
 * 🔴 Il composait « fiche — déclinaison » jusqu'au 2026-10-29 au soir. Hugo, le
 * même jour, devant « Ancolie framboise — Ancolie framboise part » en
 * production : « pour les déclinaisons au-delà de -1, il faut afficher le nom
 * de la déclinaison seul ». Le nom d'une déclinaison se saisit pour être lu
 * seul. Le nom de la fiche (`productName`, fil v16) reste reçu et rangé : il
 * n'entre plus dans ce qui se lit.
 */
export function shopItemName(variantName: string): string {
  return variantName;
}
