import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { PaymentTermsGrantedEvent } from "../../domain/events/staff-acts.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { GrantTermsCommand } from "./grant-terms.command.js";

/**
 * Fixe la condition de règlement convenue avec le client.
 *
 * Handler **staff** (Porte B) des pièces d'activation. Il ne rejoue **aucun mur
 * membership** — l'auth staff (`AdminAuthGuard`) garde la route en amont, et le
 * staff n'est membre d'aucune société. Il délègue directement au même port
 * d'écriture que son homologue client : la logique de persistance n'est écrite
 * qu'une fois, seul le mur diffère.
 */
@CommandHandler(GrantTermsCommand)
export class GrantTermsHandler implements ICommandHandler<GrantTermsCommand, void> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: GrantTermsCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    company.grantTerms(command.grantedTerms);
    await this.uow.run(async () => {
      await this.companies.save(company);
      await this.events.publishTraced(
        new PaymentTermsGrantedEvent(command.companyId, command.grantedTerms),
      );
    });
  }
}
