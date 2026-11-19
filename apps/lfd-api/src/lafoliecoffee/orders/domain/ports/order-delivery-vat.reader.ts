import type { DeliveryVatMode } from "@lfd/contracts";

/**
 * Port de **lecture** du mode de TVA de la livraison d'une commande NEUVE, vu
 * depuis la passation et le devis
 * (`documentation/commandes/bon-et-pieces/architecture-tva-des-frais-de-port.md`).
 *
 * En production, il rend toujours `follows_goods` (`ProrataDeliveryVatReader`).
 * Il reste un port pour que les tests du moteur éprouvent aussi `standard`, que
 * portent encore les commandes figées avant cette règle.
 */
export abstract class OrderDeliveryVatReader {
  abstract current(): Promise<DeliveryVatMode>;
}
