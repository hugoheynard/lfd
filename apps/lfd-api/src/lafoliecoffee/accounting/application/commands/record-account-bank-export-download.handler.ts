import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { AccountBankExportEvent } from "../../domain/events/account-bank-export.events.js";
import { AccountBankExportRepository } from "../../domain/ports/account-bank-export.repository.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { accountExportOrFail } from "../account-bank-export-support.js";
import { exportEntityOrFail, journalEntity } from "../mandate-bank-export-support.js";
import { RecordAccountBankExportDownloadCommand } from "./record-account-bank-export-download.command.js";

/**
 * **Le téléchargement au journal** (doc `prerequis-export-ribs.md` § 2.3) :
 * qui, quand, combien de comptes — jamais un IBAN. L'export garde l'instant
 * du dernier téléchargement (ce qui ouvre « marquer importé ») ; l'agrégat
 * refuse un export abandonné, que la route du fichier a déjà calculé — le
 * refus empêche alors de le servir.
 */
@CommandHandler(RecordAccountBankExportDownloadCommand)
export class RecordAccountBankExportDownloadHandler implements ICommandHandler<
  RecordAccountBankExportDownloadCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly exports: AccountBankExportRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RecordAccountBankExportDownloadCommand): Promise<void> {
    const at = this.clock.now();
    const entity = await exportEntityOrFail(this.entities, command.legalEntityId);
    await this.uow.run(async () => {
      const bankExport = await accountExportOrFail(this.exports, entity.id, command.exportId);
      bankExport.recordDownload(at);
      await this.exports.save(bankExport);
      await this.events.publishTraced(
        new AccountBankExportEvent("downloaded", bankExport, journalEntity(entity), at),
      );
    });
  }
}
