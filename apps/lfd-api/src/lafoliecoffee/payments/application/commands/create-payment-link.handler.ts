import type { CreatedPaymentLink } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PaymentLink } from "../../domain/entities/payment-link.js";
import { PaymentLinkCompanyNotFoundError } from "../../domain/errors/payment-link-errors.js";
import { PaymentLinkCreatedEvent } from "../../domain/events/payment-link.events.js";
import { AccountingSettingsReader } from "../../domain/ports/accounting-settings.store.js";
import { CheckoutGateway } from "../../domain/ports/checkout-gateway.js";
import { PaymentLinkCompanyReader } from "../../domain/ports/payment-link-company.reader.js";
import { PaymentLinkRepository } from "../../domain/ports/payment-link.repository.js";
import { PaymentLinkTerms } from "../../domain/value-objects/payment-link-terms.js";
import { CreatePaymentLinkCommand } from "./create-payment-link.command.js";

/** Un lien libre se règle en euros. */
const PAYMENT_LINK_CURRENCY = "eur";

/**
 * Ouvre un lien libre : une session Stripe Checkout hébergée, et sa ligne chez
 * nous.
 *
 * ## 🔴 L'ordre est le sujet
 *
 * 1. le plafond est lu **maintenant**, et les termes validés contre lui ;
 * 2. la session Stripe est ouverte ensuite — jamais avant, sans quoi un refus
 *    laisserait chez le prestataire une page payable que rien ne rapproche ;
 * 3. la ligne et son fait de journal s'écrivent dans la même unité de travail.
 *
 * Si l'étape 3 échoue, une session reste ouverte chez Stripe sans ligne : son
 * paiement arriverait au webhook sous une session inconnue. Elle expire d'elle-
 * même (24 h) et ne porte que la métadonnée `paymentLinkId` pour la retrouver.
 *
 * Rend l'id et l'URL : l'écran affiche le lien à copier sans relire la liste
 * (même forme que `IssuedLinkResponse`).
 */
@CommandHandler(CreatePaymentLinkCommand)
export class CreatePaymentLinkHandler implements ICommandHandler<
  CreatePaymentLinkCommand,
  CreatedPaymentLink
> {
  constructor(
    private readonly settings: AccountingSettingsReader,
    private readonly companies: PaymentLinkCompanyReader,
    private readonly checkout: CheckoutGateway,
    private readonly links: PaymentLinkRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CreatePaymentLinkCommand): Promise<CreatedPaymentLink> {
    const companyName = await this.companies.nameOf(command.companyId);
    if (companyName === null) {
      throw new PaymentLinkCompanyNotFoundError(command.companyId);
    }
    const { paymentLinkMaxCents } = await this.settings.read();
    const terms = PaymentLinkTerms.create(command.amountCents, command.label, paymentLinkMaxCents);

    const id = this.ids.next();
    const checkout = await this.checkout.createCheckoutSession({
      amountCents: terms.amountCents,
      currency: PAYMENT_LINK_CURRENCY,
      label: terms.label,
      companyId: command.companyId,
      paymentLinkId: id,
    });
    const link = PaymentLink.create({
      id,
      companyId: command.companyId,
      terms,
      checkout,
      createdAt: this.clock.now(),
      createdByStaffId: command.staffUserId,
    });
    await this.uow.run(async () => {
      await this.links.save(link);
      await this.events.publishTraced(new PaymentLinkCreatedEvent(link, companyName));
    });
    return { id, url: checkout.url };
  }
}
