import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyUnarchivedEvent } from "../../domain/events/company-archive.events.js";
import { companyNamed } from "../../domain/events/journal-names.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { CompanyRowLock } from "../../domain/ports/company-row.lock.js";
import { UnarchiveCompanyCommand } from "./unarchive-company.command.js";

/**
 * Rend un compte supprimé : l'agrégat refuse un compte qui ne l'est pas. Sous
 * le même verrou de ligne que la suppression : deux clics simultanés ne
 * journalisent pas deux retours.
 */
@CommandHandler(UnarchiveCompanyCommand)
export class UnarchiveCompanyHandler implements ICommandHandler<UnarchiveCompanyCommand, void> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly lock: CompanyRowLock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UnarchiveCompanyCommand): Promise<void> {
    await this.uow.run(async () => {
      if (!(await this.lock.lock(command.companyId))) {
        throw new CompanyNotFoundError(command.companyId);
      }
      const company = await this.companies.load(command.companyId);
      if (company === null) {
        throw new CompanyNotFoundError(command.companyId);
      }
      company.unarchive();
      await this.companies.save(company);
      await this.events.publishTraced(
        new CompanyUnarchivedEvent(companyNamed(command.companyId, company)),
      );
    });
  }
}
