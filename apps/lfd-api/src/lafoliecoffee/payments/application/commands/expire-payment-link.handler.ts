import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
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
  constructor(
    private readonly links: PaymentLinkRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ExpirePaymentLinkCommand): Promise<void> {
    // Sous le verrou de la ligne : une expiration ne recouvre pas un paiement
    // ou une annulation validés pendant qu'elle lisait.
    await this.uow.run(async () => {
      const link = await this.links.loadBySessionLocked(command.sessionId);
      if (link === null || !link.expire()) {
        return;
      }
      await this.links.save(link);
    });
  }
}
