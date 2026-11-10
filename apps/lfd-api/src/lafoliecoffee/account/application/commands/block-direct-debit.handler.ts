import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { companyNamed } from "../../domain/events/journal-names.js";
import { DirectDebitBlockedEvent } from "../../domain/events/staff-acts.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { BlockDirectDebitCommand } from "./block-direct-debit.command.js";

/**
 * Bloque le prélèvement d'une société. L'agrégat refuse un double blocage et un
 * blocage sans crédit ; le handler ne fait que charger, dater et écrire — la
 * société et son fait de journal dans la même unité de travail.
 */
@CommandHandler(BlockDirectDebitCommand)
export class BlockDirectDebitHandler implements ICommandHandler<BlockDirectDebitCommand, void> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: BlockDirectDebitCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    company.blockDirectDebit(command.reason, this.clock.now(), command.staffUserId);
    const reason = company.directDebitBlock?.reason ?? command.reason;
    await this.uow.run(async () => {
      await this.companies.save(company);
      await this.events.publishTraced(
        new DirectDebitBlockedEvent(companyNamed(command.companyId, company), reason),
      );
    });
  }
}
