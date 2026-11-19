import type { OrderRevisionQuoteView } from "@lfd/contracts";

import type { RequestedOrderChange } from "../customer-request-details.js";

/**
 * Port de **lecture** : ce que la modification demandée donnerait sur la
 * commande telle qu'elle est — le devis de révision de l'équipe (ancien et
 * nouveau total, lignes, ce qui change), ou son refus avec sa phrase.
 * `exceedItemLimits` : le droit de passer outre la limite d'un produit, de la
 * personne qui lit — le devis annonce alors les limites qu'elle dépasserait.
 */
export abstract class OrderChangeQuoter {
  abstract quote(
    orderId: string,
    staffUserId: string,
    change: RequestedOrderChange,
    exceedItemLimits: boolean,
  ): Promise<OrderRevisionQuoteView>;
}
