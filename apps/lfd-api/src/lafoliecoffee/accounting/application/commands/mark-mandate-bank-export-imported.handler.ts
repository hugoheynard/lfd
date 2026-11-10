import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MandateBankExportNotFoundError } from "../../domain/errors/mandate-bank-export-errors.js";
import { MandateBankExportImportedEvent } from "../../domain/events/mandate-bank-export.events.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { MandateBankExportRepository } from "../../domain/ports/mandate-bank-export.repository.js";
import { exportEntityOrFail, journalEntity } from "../mandate-bank-export-support.js";
import { MarkMandateBankExportImportedCommand } from "./mark-mandate-bank-export-imported.command.js";

/**
 * **« Marquer importé »** (plan § 2 bis-4) : l'agrégat refuse un second
 * marquage ; l'export doit appartenir à l'entité de la route — un export d'une
 * autre entité est un 404, pas un 403 : il n'existe pas pour elle.
 */
@CommandHandler(MarkMandateBankExportImportedCommand)
export class MarkMandateBankExportImportedHandler implements ICommandHandler<
  MarkMandateBankExportImportedCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly exports: MandateBankExportRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: MarkMandateBankExportImportedCommand): Promise<void> {
    const at = this.clock.now();
    const entity = await exportEntityOrFail(this.entities, command.legalEntityId);
    await this.uow.run(async () => {
      const bankExport = await this.exports.load(entity.id, command.exportId);
      if (bankExport === null) {
        throw new MandateBankExportNotFoundError(command.exportId);
      }
      bankExport.markImported({ at, staffId: command.staffUserId });
      await this.exports.save(bankExport);
      await this.events.publishTraced(
        new MandateBankExportImportedEvent(bankExport, journalEntity(entity), at),
      );
    });
  }
}
