import { Injectable } from "@nestjs/common";

import { HANDOVER_HANDED_OVER } from "../../../../handover/channels/commerce/index.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const ON_REMAINDER_HANDED_OVER = "b2b.delivery-notes.hand-over-remainder";

/**
 * **Un abonné muet**, gardé inscrit pour la boîte d'envoi.
 *
 * Le second envoi d'une commande n'existe plus : le reste d'un départ
 * incomplet devient une nouvelle commande (`documentation/commandes/reliquat/reliquat.md`).
 * Chaque `handover.handed_over` publié crée pourtant une livraison par abonné
 * inscrit, et une livraison dont l'abonné a disparu finit en lettre morte.
 * L'abonné reste donc inscrit, sous le même nom, et rend la main sans rien
 * faire : le rang 1 a son propre abonné (`OnOrderHandedOver`).
 *
 * Il sortira du code une fois constaté qu'aucune livraison ne l'attend plus
 * dans `platform.outbox_delivery` (inventaire B5, § 0).
 */
@Injectable()
@DurableHandler({ type: HANDOVER_HANDED_OVER, subscriber: ON_REMAINDER_HANDED_OVER })
export class OnRemainderHandedOver implements DurableSubscriber {
  handle(): Promise<void> {
    return Promise.resolve();
  }
}
