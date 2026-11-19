import type { DeliveryVatMode } from "@lfd/contracts";

import { OrderDeliveryVatReader } from "../domain/ports/order-delivery-vat.reader.js";

/**
 * Le port de livraison d'une commande neuve suit **toujours** le taux de ce
 * qu'il transporte, au prorata de la base hors taxe de chaque taux (décidé par
 * Hugo le 2026-11-19) : livrer ses propres marchandises est l'accessoire de la
 * vente, et l'accessoire suit le principal. Aucun réglage ne le change.
 */
export class ProrataDeliveryVatReader extends OrderDeliveryVatReader {
  current(): Promise<DeliveryVatMode> {
    return Promise.resolve("follows_goods");
  }
}
