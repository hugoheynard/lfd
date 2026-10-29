/**
 * **Le SKU de vente d'un article** — celui que la vitrine montre, que le
 * panier, le devis et `POST /orders` renvoient
 * (`documentation/catalogue/plan-declinaisons-en-vignette.md`, V4).
 *
 * 🔴 **Toute déclinaison se vend sous SA référence, le défaut compris**, depuis
 * la bascule du 2026-10-29 (`plan-defaut-sous-sa-reference.md`, L3). Le défaut
 * se vendait jusque-là sous le SKU de son produit (`PAI-001`), qui voulait
 * donc dire « le défaut du moment » : un changement de défaut faisait glisser
 * tout ce qui était posé dessus. La référence produit ne vend plus rien ; elle
 * reste une ancienne clé, que `sale_sku_alias` traduit à l'entrée
 * (`SaleReferenceIntake`) et à la lecture du passé (`SaleSkuAliases`).
 *
 * Gardée en fonction plutôt qu'inlinée : les jumelles en requête
 * (`soldUnderShopSkus`, `PrismaWithdrawnShopSkusReader`) et tous les lecteurs
 * la citent comme le seul point qui décide de la clé.
 */
export function shopSkuOf(item: { readonly sku: string }): string {
  return item.sku;
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
