/**
 * **« Lesquels de ces articles sont dans un panier ? »** — la lecture que le
 * panier publie pour le commerce, déclarée et implémentée par lui.
 *
 * Le catalogue la pose avant de figer l'unité d'une référence de vente : un
 * panier qui la contient a été composé dans l'unité d'alors. La réponse ne
 * dit ni à qui, ni combien — seulement « au moins un panier ».
 *
 * Le panier est seul à savoir que ses lignes vivent dans un `jsonb` : le
 * commerce demande, il ne lit pas la table.
 */
export abstract class ShopCartSkuUsage {
  /**
   * Les SKU de la liste présents dans au moins un panier, toutes personnes et
   * tous espaces confondus.
   */
  abstract skusInCarts(skus: readonly string[]): Promise<ReadonlySet<string>>;
}
