/**
 * **Les lignes vendues sous ces SKU de vente** (`shopSkuOf`) : le défaut d'un
 * SKU produit, ou une autre déclinaison sous son propre SKU quand sa fiche
 * montre chaque déclinaison (`plan-declinaisons-en-vignette.md`, V4). Les deux
 * branches ne se recouvrent pas : produits et déclinaisons partagent le
 * registre unique du référentiel.
 */
export function soldUnderShopSkus(shopSkus: readonly string[]) {
  return {
    OR: [
      { productSku: { in: [...shopSkus] }, isDefault: true },
      { sku: { in: [...shopSkus] }, isDefault: false, variantsAsTiles: true },
    ],
  };
}
