import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OwnEstablishmentNotDeclaredError } from "../../domain/errors/collection-test-errors.js";
import { OwnEstablishmentWithdrawnEvent } from "../../domain/events/collection-test.events.js";
import { EstablishmentCompaniesReader } from "../../domain/ports/establishment-companies.reader.js";
import { OwnEstablishmentRepository } from "../../domain/ports/own-establishment.repository.js";
import { establishmentCompanyOrFail } from "../own-establishment-support.js";
import { WithdrawOwnEstablishmentCommand } from "./withdraw-own-establishment.command.js";

/**
 * **Retirer un établissement** : la ligne reste, avec qui l'a retirée. Les
 * essais passés sur elle restent dans la liste.
 */
@CommandHandler(WithdrawOwnEstablishmentCommand)
export class WithdrawOwnEstablishmentHandler implements ICommandHandler<
  WithdrawOwnEstablishmentCommand,
  void
> {
  constructor(
    private readonly companies: EstablishmentCompaniesReader,
    private readonly establishments: OwnEstablishmentRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: WithdrawOwnEstablishmentCommand): Promise<void> {
    const at = this.clock.now();
    const company = await establishmentCompanyOrFail(this.companies, command.companyId);
    await this.uow.run(async () => {
      const establishment = await this.establishments.load(company.companyId);
      if (establishment === null) {
        throw new OwnEstablishmentNotDeclaredError(company.name);
      }
      establishment.withdraw({ at, staffId: command.staffUserId }, company.name);
      await this.establishments.save(establishment);
      await this.events.publishTraced(
        new OwnEstablishmentWithdrawnEvent(
          { companyId: company.companyId, name: company.name },
          at,
        ),
      );
    });
  }
}
