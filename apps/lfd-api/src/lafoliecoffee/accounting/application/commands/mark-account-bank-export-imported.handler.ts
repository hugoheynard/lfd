import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { AccountBankExportEvent } from "../../domain/events/account-bank-export.events.js";
import { AccountBankExportRepository } from "../../domain/ports/account-bank-export.repository.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { accountExportOrFail } from "../account-bank-export-support.js";
import { exportEntityOrFail, journalEntity } from "../mandate-bank-export-support.js";
import { MarkAccountBankExportImportedCommand } from "./mark-account-bank-export-imported.command.js";

/**
 * **« Marquer importé »** (doc `prerequis-export-ribs.md` § 2.3) : l'agrégat
 * refuse un export déjà clos ; un export d'une autre entité est un 404 — il
 * n'existe pas pour elle.
 */
@CommandHandler(MarkAccountBankExportImportedCommand)
export class MarkAccountBankExportImportedHandler implements ICommandHandler<
  MarkAccountBankExportImportedCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly exports: AccountBankExportRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: MarkAccountBankExportImportedCommand): Promise<void> {
    const at = this.clock.now();
    const entity = await exportEntityOrFail(this.entities, command.legalEntityId);
    await this.uow.run(async () => {
      const bankExport = await accountExportOrFail(this.exports, entity.id, command.exportId);
      bankExport.markImported({ at, staffId: command.staffUserId });
      await this.exports.save(bankExport);
      await this.events.publishTraced(
        new AccountBankExportEvent("imported", bankExport, journalEntity(entity), at),
      );
    });
  }
}
