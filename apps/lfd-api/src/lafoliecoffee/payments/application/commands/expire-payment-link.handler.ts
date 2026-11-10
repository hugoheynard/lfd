import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PaymentLinkRepository } from "../../domain/ports/payment-link.repository.js";
import { ExpirePaymentLinkCommand } from "./expire-payment-link.command.js";

/**
 * Passe un lien ouvert à `expired`. Sans effet sur tout autre état : un
 * `expired` qui suit notre propre annulation — c'est nous qui fermons la
 * session — n'a rien à réécrire, et un webhook rejoué non plus.
 *
 * `@sans-journal` projection d'un événement Stripe (la session a vécu ses
 * 24 h), pas un acte dont un humain répond.
 */
@CommandHandler(ExpirePaymentLinkCommand)
export class ExpirePaymentLinkHandler implements ICommandHandler<ExpirePaymentLinkCommand, void> {
  constructor(private readonly links: PaymentLinkRepository) {}

  async execute(command: ExpirePaymentLinkCommand): Promise<void> {
    const link = await this.links.loadBySession(command.sessionId);
    if (link === null || !link.expire()) {
      return;
    }
    await this.links.save(link);
  }
}
