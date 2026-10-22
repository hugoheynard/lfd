import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OwnEstablishment } from "../../domain/entities/own-establishment.js";
import { OwnEstablishmentDeclaredEvent } from "../../domain/events/collection-test.events.js";
import { EstablishmentCompaniesReader } from "../../domain/ports/establishment-companies.reader.js";
import { OwnEstablishmentRepository } from "../../domain/ports/own-establishment.repository.js";
import { establishmentCompanyOrFail } from "../own-establishment-support.js";
import { DeclareOwnEstablishmentCommand } from "./declare-own-establishment.command.js";

/**
 * **Déclarer un de nos établissements** : une ligne neuve, ou la
 * redéclaration d'une société retirée. L'agrégat refuse une société déjà
 * déclarée.
 */
@CommandHandler(DeclareOwnEstablishmentCommand)
export class DeclareOwnEstablishmentHandler implements ICommandHandler<
  DeclareOwnEstablishmentCommand,
  void
> {
  constructor(
    private readonly companies: EstablishmentCompaniesReader,
    private readonly establishments: OwnEstablishmentRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DeclareOwnEstablishmentCommand): Promise<void> {
    const at = this.clock.now();
    const stamp = { at, staffId: command.staffUserId };
    const company = await establishmentCompanyOrFail(this.companies, command.companyId);
    await this.uow.run(async () => {
      const existing = await this.establishments.load(company.companyId);
      const establishment = existing ?? OwnEstablishment.declare(company.companyId, stamp);
      if (existing !== null) {
        existing.redeclare(stamp, company.name);
      }
      await this.establishments.save(establishment);
      await this.events.publishTraced(
        new OwnEstablishmentDeclaredEvent({ companyId: company.companyId, name: company.name }, at),
      );
    });
  }
}
