import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MandateNotFoundError } from "../../domain/errors/mandate-errors.js";
import { MandateRevokedEvent } from "../../domain/events/payment-mandate.events.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { RevokeMandateCommand } from "./revoke-mandate.command.js";
import { mandateCompanyOf } from "../mandate-journal-names.js";

/**
 * Révoque le mandat courant — actif ou brouillon — depuis la fiche.
 *
 * Une seule écriture, locale : le mandat est frappé et rangé chez nous, et
 * traité directement avec la banque. Il n'y a rien à détacher chez un
 * prestataire — le chemin Stripe qui le faisait a été supprimé le 2026-09-19,
 * aucun mandat Stripe n'existant en production (Hugo).
 *
 * Journalisé depuis le 2026-09-19 (`payment_mandate.revoked`), dans la
 * transaction de l'écriture.
 */
@CommandHandler(RevokeMandateCommand)
export class RevokeMandateHandler implements ICommandHandler<RevokeMandateCommand, void> {
  constructor(
    private readonly mandates: PaymentMandateRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RevokeMandateCommand): Promise<void> {
    const mandate = await this.mandates.findCurrent(command.companyId);
    if (mandate === null) {
      throw new MandateNotFoundError(command.companyId);
    }
    const previousStatus = mandate.status;
    mandate.revoke(this.clock.now());
    const company = await mandateCompanyOf(this.mandates, mandate.companyId);
    await this.uow.run(async () => {
      await this.mandates.save(mandate);
      await this.events.publishTraced(
        new MandateRevokedEvent(mandate.id, company, mandate.reference, previousStatus),
      );
    });
  }
}
