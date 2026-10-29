/**
 * **Les lignes vendues sous ces SKU de vente** (`shopSkuOf`) : le défaut d'un
 * SKU produit, ou une autre déclinaison sous son propre SKU quand sa fiche
 * montre chaque déclinaison (`plan-declinaisons-en-vignette.md`, V4). Les deux
 * branches ne se recouvrent pas : produits et déclinaisons partagent le
 * registre unique du référentiel.
 *
 * C'est la jumelle en REQUÊTE de `shopSkuOf` — une clause ne peut pas appeler
 * la fonction — et elle bascule avec elle (L3 de
 * `plan-defaut-sous-sa-reference.md` : une seule branche `sku IN …`).
 * L'appelant passe des références déjà CANONIQUES (`SaleSkuAliases`) : une
 * ancienne référence se résout à l'entrée, jamais ici.
 */
export function soldUnderShopSkus(shopSkus: readonly string[]) {
  return {
    OR: [
      { productSku: { in: [...shopSkus] }, isDefault: true },
      { sku: { in: [...shopSkus] }, isDefault: false, variantsAsTiles: true },
    ],
  };
}
