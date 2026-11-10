import { CommandBus, CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CheckoutGateway } from "../../domain/ports/checkout-gateway.js";
import { paymentLinkCommandFor } from "../payment-link-outcome-commands.js";
import { RecordPaymentLinkEventCommand } from "./record-payment-link-event.command.js";

/**
 * **Le webhook des liens de paiement** (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §4.5) : la signature vérifiée avec le secret DE CET endpoint, puis
 * l'issue projetée par `SettlePaymentLinkCommand` ou `ExpirePaymentLinkCommand`,
 * toutes deux idempotentes — pendant que les `checkout.*` arrivent aussi par
 * le relais du webhook des cartes, le second passage ne réécrit rien.
 *
 * @sans-journal Projection d'un événement Stripe, pas un acte dont un humain
 * répond — comme les deux commandes qu'il émet.
 */
@CommandHandler(RecordPaymentLinkEventCommand)
export class RecordPaymentLinkEventHandler implements ICommandHandler<
  RecordPaymentLinkEventCommand,
  void
> {
  constructor(
    private readonly checkout: CheckoutGateway,
    private readonly commands: CommandBus,
  ) {}

  async execute(command: RecordPaymentLinkEventCommand): Promise<void> {
    const event = this.checkout.parseLinkWebhook(command.rawBody, command.signature);
    if (event.kind === "ignored") {
      return;
    }
    await this.commands.execute(paymentLinkCommandFor(event.kind, event.sessionId));
  }
}
