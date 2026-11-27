/**
 * **Les lignes vendues sous ces SKU de vente** (`shopSkuOf`) : chaque
 * déclinaison sous SA référence, le défaut comme les autres.
 *
 * C'est la jumelle en REQUÊTE de `shopSkuOf` — une clause ne peut pas appeler
 * la fonction. Une seule branche `sku IN …` depuis la bascule du 2026-10-29
 * (`plan-defaut-sous-sa-reference.md`, L3) : la branche « `productSku IN …`
 * et défaut » est tombée avec la vente du défaut sous la référence produit,
 * et la migration de bascule a réécrit toute référence produit stockée.
 */
export function soldUnderShopSkus(shopSkus: readonly string[]) {
  return {
    sku: { in: [...shopSkus] },
  };
}
