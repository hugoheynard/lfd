import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PaymentLinkNotFoundError } from "../../domain/errors/payment-link-errors.js";
import { PaymentLinkCancelledEvent } from "../../domain/events/payment-link.events.js";
import { CheckoutGateway } from "../../domain/ports/checkout-gateway.js";
import { PaymentLinkCompanyReader } from "../../domain/ports/payment-link-company.reader.js";
import { PaymentLinkRepository } from "../../domain/ports/payment-link.repository.js";
import { CancelPaymentLinkCommand } from "./cancel-payment-link.command.js";

/**
 * Annule un lien libre, puis ferme sa session chez Stripe.
 *
 * ## Pourquoi l'annulation s'écrit AVANT l'appel à Stripe
 *
 * C'est la décision du staff, et elle vaut dès qu'il l'a prise. Si Stripe
 * refuse de fermer la session, c'est presque toujours qu'elle vient d'être
 * payée : le paiement arrivera au webhook, qui passera le lien à `paid` et
 * sonnera la cloche (plan §2b). Faire échouer l'annulation sur ce refus
 * n'apprendrait rien de plus à l'agent, et lui ferait retenter un geste
 * que la course a déjà tranché. Le refus est donc journalisé — pas avalé.
 */
@CommandHandler(CancelPaymentLinkCommand)
export class CancelPaymentLinkHandler implements ICommandHandler<CancelPaymentLinkCommand, void> {
  private readonly logger = new Logger(CancelPaymentLinkHandler.name);

  constructor(
    private readonly links: PaymentLinkRepository,
    private readonly companies: PaymentLinkCompanyReader,
    private readonly checkout: CheckoutGateway,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CancelPaymentLinkCommand): Promise<void> {
    const link = await this.links.load(command.paymentLinkId);
    if (link === null) {
      throw new PaymentLinkNotFoundError(command.paymentLinkId);
    }
    link.cancel(this.clock.now(), command.staffUserId);
    // La société existe : la clé étrangère le garantit. L'id en repli ne sert
    // qu'à ne jamais écrire un sujet vide si la lecture échouait à la nommer.
    const companyName = (await this.companies.nameOf(link.companyId)) ?? link.companyId;
    await this.uow.run(async () => {
      await this.links.save(link);
      await this.events.publishTraced(new PaymentLinkCancelledEvent(link, companyName));
    });

    try {
      await this.checkout.expireCheckoutSession(link.checkout.sessionId);
    } catch (error) {
      this.logger.warn(
        `Session Stripe ${link.checkout.sessionId} non fermée après l'annulation du lien ${link.id} : ` +
          "si elle a été payée, le webhook passera le lien à « payé » et préviendra l'équipe.",
        error,
      );
    }
  }
}
