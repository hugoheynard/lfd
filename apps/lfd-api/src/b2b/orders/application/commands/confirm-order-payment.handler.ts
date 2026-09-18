import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { OrderPaymentFailedEvent } from "../../domain/events/order-payment-failed.event.js";
import { OrderPaymentSettledEvent } from "../../domain/events/order-payment-settled.event.js";
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
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: ConfirmOrderPaymentCommand): Promise<void> {
    if (command.outcome === "succeeded") {
      const settled = await this.orders.markPaid(command.paymentIntentId);
      if (settled !== null) {
        this.events.publish(new OrderPaymentSettledEvent(settled));
      }
      return;
    }
    const refused = await this.orders.markPaymentFailed(command.paymentIntentId);
    if (refused !== null) {
      this.events.publish(new OrderPaymentFailedEvent(refused));
    }
  }
}
