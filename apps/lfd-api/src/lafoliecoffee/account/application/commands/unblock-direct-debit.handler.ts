import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { companyNamed } from "../../domain/events/journal-names.js";
import { DirectDebitUnblockedEvent } from "../../domain/events/staff-acts.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { UnblockDirectDebitCommand } from "./unblock-direct-debit.command.js";

/** Débloque le prélèvement d'une société ; l'agrégat refuse ce qui n'est pas bloqué. */
@CommandHandler(UnblockDirectDebitCommand)
export class UnblockDirectDebitHandler implements ICommandHandler<UnblockDirectDebitCommand, void> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UnblockDirectDebitCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    company.unblockDirectDebit();
    await this.uow.run(async () => {
      await this.companies.save(company);
      await this.events.publishTraced(
        new DirectDebitUnblockedEvent(companyNamed(command.companyId, company)),
      );
    });
  }
}
