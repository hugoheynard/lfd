import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { OrderPaidFact } from "../../domain/events/order-paid.fact.js";
import { OrderPaidAfterCancellationEvent } from "../../domain/events/order-paid-after-cancellation.event.js";
import { OrderPaymentFailedEvent } from "../../domain/events/order-payment-failed.event.js";
import { OrderPaymentSettledEvent } from "../../domain/events/order-payment-settled.event.js";
import { CancelledOrderPaymentReader } from "../../domain/ports/cancelled-order-payment.reader.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";
import { ConfirmOrderPaymentCommand } from "./confirm-order-payment.command.js";

/**
 * Applique l'issue d'un paiement Stripe à la commande correspondante. Le
 * rapprochement se fait par `stripePaymentIntentId` (unique). Le repository est
 * **idempotent** : un événement rejoué (Stripe réémet jusqu'à un 2xx) ou un
 * intent inconnu ne fait rien de nocif.
 *
 * ## 🔴 Il PUBLIE, depuis le 2026-09-17
 *
 * Il se contentait d'écrire une colonne que personne ne relisait. Deux
 * conséquences, et le client les subissait toutes les deux :
 *
 * - **un encaissement ne disait rien.** L'accusé de réception partait à la
 *   passation, donc AVANT le paiement — un client dont la carte était refusée
 *   trente secondes plus tard avait quand même reçu « votre commande entre dans
 *   la fournée de demain matin » ;
 * - **un refus ne disait rien non plus.** Ni au client, ni au comptoir, qui
 *   continuait de l'attendre.
 *
 * Les deux faits qu'il publie maintenant portent ces deux messages, et c'est le
 * dépôt qui décide s'il y a lieu de les émettre : il ne rend un identifiant
 * qu'au FRANCHISSEMENT. Un webhook rejoué ne bascule rien, donc ne publie rien —
 * l'idempotence du message est celle de l'écriture, pas un garde de plus.
 *
 * ## Un encaissement sur une commande annulée (lot 6 bis, 2026-09-26)
 *
 * La base ne la rouvre jamais (`markPaid` exclut `cancelled`), donc rien ne
 * franchit. Mais l'argent est reçu chez Stripe : quand l'écriture ne franchit
 * pas ET que l'intention appartient à une commande annulée, le fait
 * `OrderPaidAfterCancellationEvent` part, et la cloche dit « à rembourser ».
 * C'est le prix assumé d'une clôture que Stripe ne bloque pas (plan
 * `documentation/order/plan-abandon-du-reglement.md`, B1).
 *
 * ## Et un fait DURABLE, depuis le lot E5a (2026-10-08)
 *
 * `order.paid` part dans la même unité de travail que `markPaid` : la facture
 * carte d'une commande déjà retirée ne naît que de lui, et un fait en mémoire
 * perdu sur un redémarrage laisserait une vente sans facture (plan
 * `facture-carte-et-remboursements.md`).
 *
 * ⚠️ `publish` et non `publishTraced` : ce sont des projections d'un événement
 * externe, pas des actes dont un humain doit répondre. Le journal des actes
 * porte les gestes de l'équipe ; celui-ci appartient à Stripe.
 */
@CommandHandler(ConfirmOrderPaymentCommand)
export class ConfirmOrderPaymentHandler implements ICommandHandler<
  ConfirmOrderPaymentCommand,
  void
> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly cancelled: CancelledOrderPaymentReader,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly durable: DurablePublisher,
  ) {}

  async execute(command: ConfirmOrderPaymentCommand): Promise<void> {
    if (command.outcome === "succeeded") {
      const settled = await this.uow.run(async () => {
        const orderId = await this.orders.markPaid(command.paymentIntentId);
        if (orderId !== null) {
          await this.durable.publish(new OrderPaidFact(orderId).durableFact());
        }
        return orderId;
      });
      if (settled !== null) {
        this.events.publish(new OrderPaymentSettledEvent(settled));
        return;
      }
      const refundDue = await this.cancelled.cancelledOrderOf(command.paymentIntentId);
      if (refundDue !== null) {
        this.events.publish(new OrderPaidAfterCancellationEvent(refundDue));
      }
      return;
    }
    const refused = await this.orders.markPaymentFailed(command.paymentIntentId);
    if (refused !== null) {
      this.events.publish(new OrderPaymentFailedEvent(refused, "refused"));
    }
  }
}
