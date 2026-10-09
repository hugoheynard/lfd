import { Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import {
  OrderPaymentFailedEvent,
  type PaymentFailureCause,
} from "../../domain/events/order-payment-failed.event.js";
import { FailedSettlementReader } from "../../domain/ports/failed-settlement.reader.js";

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
 */
@EventsHandler(OrderPaymentFailedEvent)
export class RingFailedProSettlement implements IEventHandler<OrderPaymentFailedEvent> {
  private readonly logger = new Logger(RingFailedProSettlement.name);

  constructor(
    private readonly orders: FailedSettlementReader,
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: OrderPaymentFailedEvent): void {
    void this.work.track(this.run(event), "ring-failed-pro-settlement");
  }

  private async run(event: OrderPaymentFailedEvent): Promise<void> {
    // Sonner ne fait jamais échouer le geste : le règlement est déjà écrit.
    try {
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
    } catch (error) {
      this.logger.error(`Cloche « règlement tombé » non émise (commande ${event.orderId})`, error);
    }
  }
}
