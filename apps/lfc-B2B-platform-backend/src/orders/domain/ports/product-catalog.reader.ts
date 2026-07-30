/** Ce que le seed porte pour un SKU : nom + prix en centimes TTC. */
export interface PricedSku {
  readonly sku: string;
  readonly name: string;
  readonly unitPriceCents: number;
}

/** Un article du catalogue, tel que le checkout en a besoin. Prix en centimes TTC. */
export interface CatalogItem extends PricedSku {
  /** Taux de TVA en %, ex. 5.5. `0` tant que le modèle canaux TVA n'est pas branché. */
  readonly vatRate: number;
}

/**
 * Port de **lecture** du catalogue — l'autorité de prix au checkout.
 *
 * Le client n'envoie qu'un `sku` et une quantité : c'est ici que le serveur
 * résout le nom et le prix réels. Ne jamais faire confiance au prix envoyé par le
 * client. Source jetable (seed) jusqu'à la vraie synchro PIM.
 */
export abstract class ProductCatalogReader {
  /** Résout un SKU, ou `null` s'il est inconnu du catalogue. */
  abstract resolve(sku: string): CatalogItem | null;
}
