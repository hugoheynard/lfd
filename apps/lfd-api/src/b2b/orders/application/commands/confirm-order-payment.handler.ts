import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { OrderRepository } from "../../domain/ports/order.repository.js";
import { ConfirmOrderPaymentCommand } from "./confirm-order-payment.command.js";

/**
 * Applique l'issue d'un paiement Stripe à la commande correspondante. Le
 * rapprochement se fait par `stripePaymentIntentId` (unique). Le repository est
 * **idempotent** : un événement rejoué (Stripe réémet jusqu'à un 2xx) ou un
 * intent inconnu ne fait rien de nocif.
 */
@CommandHandler(ConfirmOrderPaymentCommand)
export class ConfirmOrderPaymentHandler implements ICommandHandler<
  ConfirmOrderPaymentCommand,
  void
> {
  constructor(private readonly orders: OrderRepository) {}

  async execute(command: ConfirmOrderPaymentCommand): Promise<void> {
    if (command.outcome === "succeeded") {
      await this.orders.markPaid(command.paymentIntentId);
      return;
    }
    await this.orders.markPaymentFailed(command.paymentIntentId);
  }
}
