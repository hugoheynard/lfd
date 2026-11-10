import type { ShopAudience } from "../../../catalog/domain/ports/catalog.reader.js";

/**
 * Qui lit la vitrine — décidé par la ROUTE, jamais par un paramètre qui
 * élargirait l'audience d'un appelant reconnu :
 *
 * - `anonymous` : la boutique sans connexion, à l'audience qu'elle annonce
 *   (comme `/fulfillment-days` et `/shop/catalogue`) — le pro anonyme ne lit
 *   que le rayon pro public, jamais un article réservé ;
 * - `acting` : un client reconnu, sa société résolue par le guard (`null` =
 *   l'espace perso, le particulier).
 */
export type ShelfStockCaller =
  | { readonly kind: "anonymous"; readonly audience: ShopAudience }
  | { readonly kind: "acting"; readonly companyId: string | null };

/**
 * Query : le reste d'aujourd'hui d'un point, par article, pour CET appelant
 * (plan `documentation/limites-de-commande/jour-meme-sur-stock.md`,
 * lot L7b).
 */
export class GetShelfStockTodayQuery {
  constructor(
    readonly pickupAddressId: string,
    readonly caller: ShelfStockCaller,
  ) {}
}
