import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { InvoicePaymentTermsChangedEvent } from "../../domain/events/legal-entity.events.js";
import { LegalEntityRepository } from "../../domain/ports/legal-entity.repository.js";
import { loadOrFail } from "../legal-entity-support.js";
import { SetInvoicePaymentTermsCommand } from "./legal-entity-commands.js";

/**
 * Règle les mentions de paiement de la facture de l'entité.
 *
 * Un fait au journal à chaque changement réel, l'APRÈS au payload : ces
 * mentions s'imprimeront sur des factures, et « quel taux portait la facture
 * de mars, et qui l'avait saisi » doit se lire seul. Une saisie rejouée
 * n'écrit rien (plan `plan-emission-de-la-facture.md`, E0).
 */
@CommandHandler(SetInvoicePaymentTermsCommand)
export class SetInvoicePaymentTermsHandler implements ICommandHandler<
  SetInvoicePaymentTermsCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetInvoicePaymentTermsCommand): Promise<void> {
    const entity = await loadOrFail(this.entities, command.legalEntityId);
    if (!entity.setInvoicePaymentTerms(command.payload)) {
      return;
    }
    const terms = entity.paymentTerms;
    const at = this.clock.now();
    await this.uow.run(async () => {
      await this.entities.save(entity);
      await this.events.publishTraced(
        new InvoicePaymentTermsChangedEvent({ id: entity.id, name: entity.name }, at, {
          latePenaltyRateBasisPoints: terms.latePenaltyRateBasisPoints,
          recoveryIndemnityCents: terms.recoveryIndemnityCents,
          earlyPaymentDiscount: terms.earlyPaymentDiscount,
        }),
      );
    });
  }
}
