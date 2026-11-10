import { Injectable } from "@nestjs/common";

import {
  COMMERCE_ORDER_PLACED,
  CommerceOrderPlacedFact,
} from "../../../../delivery/channels/commerce/commerce-order-placed.fact.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import type { OrderNoticeSummary } from "../../../orders/domain/ports/order-notice-summary.reader.js";
import { SubAccountNoticeDispatcher } from "../services/sub-account-notice.dispatcher.js";

/** L'auteur d'une passation : le client, sauf saisie par l'équipe (personne côté client). */
export function placementAuthor(summary: OrderNoticeSummary): string | null {
  return summary.enteredByTeam ? null : summary.placedByUserId;
}

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const NOTIFY_PRINCIPAL_ON_ORDER_PLACED = "b2b.sub-account-notices.on-order-placed";

/**
 * **Un site a passé une commande → son principal est prévenu**
 * (`plan-notifications-sous-comptes.md`, N2, clé `order_placed`).
 *
 * Écoute `commerce.order_placed`, le seul fait durable de la passation : les
 * trois entrées l'écrivent dans leur transaction (`place-order`,
 * `place-order-for-customer`, `place-shop-order`, vérifié le 2026-10-20). Le
 * type `order.placed` n'existe qu'au journal croissance.
 *
 * Une commande CARTE n'est pas annoncée ici : elle l'est au paiement
 * confirmé (`NotifyPrincipalOnOrderPaid`, décision de Hugo du 2026-10-20).
 *
 * L'auteur est la personne au nom de qui la commande est passée — sauf quand
 * l'équipe l'a saisie : personne côté client n'a alors fait le geste.
 *
 * L'identifiant du fait est STABLE d'une relivraison à l'autre : c'est l'id
 * de la ligne `platform.outbox`, tiré une fois à l'écriture, et le relais
 * relit celle-ci à chaque tentative (`prisma-outbox.ts`,
 * `prisma-outbox-relay-store.ts`, vérifié le 2026-10-20). Le journal d'envoi
 * peut donc s'y adosser.
 */
@Injectable()
@DurableHandler({ type: COMMERCE_ORDER_PLACED, subscriber: NOTIFY_PRINCIPAL_ON_ORDER_PLACED })
export class NotifyPrincipalOnOrderPlaced implements DurableSubscriber {
  constructor(private readonly notices: SubAccountNoticeDispatcher) {}

  handle(delivery: DurableDelivery): Promise<void> {
    const fact = CommerceOrderPlacedFact.fromPayload(delivery.payload);
    return this.notices.notify({
      eventId: delivery.eventId,
      kind: "order_placed",
      activity: "placed",
      orderId: fact.orderId,
      authorOf: placementAuthor,
      // Carte : l'avis attend `order.paid` (Hugo, 2026-10-20), comme l'accusé
      // au client — `NotifyPrincipalOnOrderPaid`.
      concerns: (summary) => summary.settledAtPlacement,
    });
  }
}
