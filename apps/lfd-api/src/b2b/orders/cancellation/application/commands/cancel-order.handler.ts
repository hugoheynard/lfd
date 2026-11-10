import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CancellationReason } from "../../domain/value-objects/cancellation-reason.js";
import { OrderCancellation } from "../services/order-cancellation.service.js";
import { CancelOrderCommand } from "./cancel-order.command.js";

/**
 * **L'annulation d'une commande par l'équipe** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, lot C3 : C3.3 à C3.7).
 *
 * Le motif est obligatoire et validé AVANT toute lecture (`CancellationReason`),
 * puis tout le reste — règle, Stripe, fournil, bon, remboursement, fait — est
 * le noyau {@link OrderCancellation}, partagé avec l'annulation par le client
 * depuis le lot C6 (C6.6). Le découpage n'a rien changé au geste staff : mêmes
 * refus, même ordre, même écriture.
 *
 * Aucun mur client : la route est staff.
 */
@CommandHandler(CancelOrderCommand)
export class CancelOrderHandler implements ICommandHandler<CancelOrderCommand, void> {
  constructor(private readonly cancellation: OrderCancellation) {}

  async execute(command: CancelOrderCommand): Promise<void> {
    const reason = CancellationReason.of(command.reason);
    await this.cancellation.cancel(command.orderId, {
      actor: { kind: "staff", staffUserId: command.staffUserId },
      reasonText: reason.value,
      reasonCode: null,
      policy: null,
    });
  }
}
