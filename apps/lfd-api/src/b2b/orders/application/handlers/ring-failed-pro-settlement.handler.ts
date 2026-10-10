import { Injectable } from "@nestjs/common";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";

import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import {
  ORDER_PAYMENT_FAILED,
  OrderPaymentFailedEvent,
  type PaymentFailureCause,
} from "../../domain/events/order-payment-failed.event.js";
import { FailedSettlementReader } from "../../domain/ports/failed-settlement.reader.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RING_FAILED_PRO_SETTLEMENT = "orders.ring-failed-pro-settlement";

/** Ce que la cloche dit de chaque cause, après « Règlement tombé — ». */
const CAUSE_LINES: Readonly<Record<PaymentFailureCause, string>> = {
  refused: "la banque a refusé la carte. La commande reste en attente de règlement",
  abandoned:
    "le client a quitté l'écran de règlement sans payer. La commande est abandonnée, " +
    "encore payable jusqu'à la clôture de la journée : à relancer",
  day_closed:
    "le paiement n'a pas abouti avant la clôture de la journée. La commande est annulée, " +
    "à ressaisir s'il le faut",
  // Les deux suivantes ne visent que la clientèle `public`, qui ne sonne pas
  // (`UnsettledShopOrderExpiry`) : écrites pour que la table reste totale.
  expired: "le paiement n'a pas abouti dans le délai. La commande est annulée",
  replaced: "le client a passé une nouvelle commande. Celle-ci est annulée",
};

/**
 * **Tout règlement pro qui meurt sonne** (plan
 * `documentation/order/plan-abandon-du-reglement.md`, D4, Q3, Q7).
 *
 * Accrochée à l'ÉVÉNEMENT et non aux appelants : tout ce qui publie un
 * règlement mort — le refus du webhook, l'abandon du client, la clôture —
 * sonne par construction, sans qu'aucun d'eux ait à s'en souvenir.
 *
 * Un particulier ne sonne pas : sa commande est annulée ou reprise par lui
 * seul, et personne n'a à le relancer. Une clientèle inconnue (`NULL`,
 * commande d'avant la distinction) non plus : on ne sait pas qui relancer.
 *
 * Sans destinataire nommé : « le commercial » est un rôle, pas une personne
 * (§5) — la cloche est visible de tout le back-office.
 *
 * Une clé par commande ET par cause : un refus puis la clôture de la même
 * commande sont deux nouvelles, un webhook rejoué n'en est pas une.
 *
 * ## Durable depuis le 2026-10-10 (lot E4b)
 *
 * Elle écoutait le fait en mémoire, publié APRÈS l'écriture : un redémarrage
 * entre les deux perdait la cloche d'un règlement pro tombé, sans témoin. Elle lit désormais le fait
 * durable écrit dans l'unité de travail de l'émetteur
 * (`documentation/journalisation/plan-evenements-durables.md`). Elle ne
 * rattrape plus ses échecs : le geste est déjà accusé, et c'est la boîte
 * d'envoi qui rejoue — la clé de la cloche dédoublonne.
 */
@Injectable()
@DurableHandler({ type: ORDER_PAYMENT_FAILED, subscriber: RING_FAILED_PRO_SETTLEMENT })
export class RingFailedProSettlement implements DurableSubscriber {
  constructor(
    private readonly orders: FailedSettlementReader,
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const event = OrderPaymentFailedEvent.fromPayload(delivery.payload);
    const subject = await this.orders.subjectOf(event.orderId);
    if (subject === null || subject.clientele !== "pro") {
      return;
    }
    const who = subject.companyName ?? subject.orderNumber;
    await this.notifier.notify([
      {
        kind: "order.payment_failed",
        subject: `Règlement tombé — ${who}`,
        body: `Commande ${subject.orderNumber} : ${CAUSE_LINES[event.cause]}.`,
        link: `/commandes/${event.orderId}`,
        idempotencyKey: `notification:order.payment_failed:${event.orderId}:${event.cause}`,
        occurredAt: this.clock.now(),
      },
    ]);
  }
}
