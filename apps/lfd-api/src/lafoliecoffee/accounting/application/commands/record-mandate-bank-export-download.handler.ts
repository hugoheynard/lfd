import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MandateBankExportDownloadedEvent } from "../../domain/events/mandate-bank-export.events.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { MandateBankExportRepository } from "../../domain/ports/mandate-bank-export.repository.js";
import {
  exportEntityOrFail,
  journalEntity,
  mandateExportOrFail,
} from "../mandate-bank-export-support.js";
import { RecordMandateBankExportDownloadCommand } from "./record-mandate-bank-export-download.command.js";

/**
 * **Le téléchargement au journal** (R8) : qui, quand, combien de mandats —
 * jamais un IBAN ni une RUM. L'export garde l'instant du dernier
 * téléchargement (ce qui ouvre « marquer importé ») ; l'agrégat refuse un
 * export abandonné, et le refus empêche alors de le servir.
 */
@CommandHandler(RecordMandateBankExportDownloadCommand)
export class RecordMandateBankExportDownloadHandler implements ICommandHandler<
  RecordMandateBankExportDownloadCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly exports: MandateBankExportRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RecordMandateBankExportDownloadCommand): Promise<void> {
    const at = this.clock.now();
    const entity = await exportEntityOrFail(this.entities, command.legalEntityId);
    await this.uow.run(async () => {
      const bankExport = await mandateExportOrFail(this.exports, entity.id, command.exportId);
      bankExport.recordDownload(at);
      await this.exports.save(bankExport);
      await this.events.publishTraced(
        new MandateBankExportDownloadedEvent(bankExport, journalEntity(entity), at),
      );
    });
  }
}
