import { Injectable } from "@nestjs/common";

import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { PACKING_ORDER_PACKED } from "../../../../packing/channels/commerce/index.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_REMAINDER_PACKED = "b2b.delivery-notes.prepare-remainder";

/**
 * **Un abonné muet**, gardé inscrit pour la boîte d'envoi.
 *
 * Le second envoi d'une commande n'existe plus : le reste d'un départ
 * incomplet devient une nouvelle commande (`documentation/commandes/reliquat/reliquat.md`).
 * Chaque `packing.order_packed` publié crée pourtant une livraison par abonné
 * inscrit, et une livraison dont l'abonné a disparu finit en lettre morte.
 * L'abonné reste donc inscrit, sous le même nom, et rend la main sans rien
 * faire : le rang 1 a son propre abonné (`OnPackingOrderPacked`).
 *
 * Il sortira du code une fois constaté qu'aucune livraison ne l'attend plus
 * dans `platform.outbox_delivery` (inventaire B5, § 0).
 */
@Injectable()
@DurableHandler({ type: PACKING_ORDER_PACKED, subscriber: ON_REMAINDER_PACKED })
export class OnRemainderPacked implements DurableSubscriber {
  handle(): Promise<void> {
    return Promise.resolve();
  }
}
