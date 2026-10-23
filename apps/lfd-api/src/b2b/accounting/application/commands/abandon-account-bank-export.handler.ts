import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { AccountBankExportEvent } from "../../domain/events/account-bank-export.events.js";
import { AccountBankExportRepository } from "../../domain/ports/account-bank-export.repository.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { accountExportOrFail } from "../account-bank-export-support.js";
import { exportEntityOrFail, journalEntity } from "../mandate-bank-export-support.js";
import { AbandonAccountBankExportCommand } from "./abandon-account-bank-export.command.js";

/**
 * **« Abandonner »** (doc `prerequis-export-ribs.md` § 2.3, vitruve objection
 * 3) : un export que la banque a rejeté sort de « en vol », ses comptes
 * redeviennent « à exporter ». Une fois, avec auteur et fait ; l'agrégat
 * refuse d'abandonner un export importé.
 */
@CommandHandler(AbandonAccountBankExportCommand)
export class AbandonAccountBankExportHandler implements ICommandHandler<
  AbandonAccountBankExportCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly exports: AccountBankExportRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AbandonAccountBankExportCommand): Promise<void> {
    const at = this.clock.now();
    const entity = await exportEntityOrFail(this.entities, command.legalEntityId);
    await this.uow.run(async () => {
      const bankExport = await accountExportOrFail(this.exports, entity.id, command.exportId);
      bankExport.abandon({ at, staffId: command.staffUserId });
      await this.exports.save(bankExport);
      await this.events.publishTraced(
        new AccountBankExportEvent("abandoned", bankExport, journalEntity(entity), at),
      );
    });
  }
}
