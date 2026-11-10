import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MandateBankExportAbandonedEvent } from "../../domain/events/mandate-bank-export.events.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { MandateBankExportRepository } from "../../domain/ports/mandate-bank-export.repository.js";
import {
  exportEntityOrFail,
  journalEntity,
  mandateExportOrFail,
} from "../mandate-bank-export-support.js";
import { AbandonMandateBankExportCommand } from "./abandon-mandate-bank-export.command.js";

/**
 * **« Abandonner »** (plan `plan-page-procedure-de-prelevement.md` § 3.2, S3) :
 * sans lui, un export que la banque a rejeté restait « en attente » pour
 * toujours. Une fois, avec auteur et fait ; l'agrégat refuse d'abandonner un
 * export importé.
 */
@CommandHandler(AbandonMandateBankExportCommand)
export class AbandonMandateBankExportHandler implements ICommandHandler<
  AbandonMandateBankExportCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly exports: MandateBankExportRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AbandonMandateBankExportCommand): Promise<void> {
    const at = this.clock.now();
    const entity = await exportEntityOrFail(this.entities, command.legalEntityId);
    await this.uow.run(async () => {
      const bankExport = await mandateExportOrFail(this.exports, entity.id, command.exportId);
      bankExport.abandon({ at, staffId: command.staffUserId });
      await this.exports.save(bankExport);
      await this.events.publishTraced(
        new MandateBankExportAbandonedEvent(bankExport, journalEntity(entity), at),
      );
    });
  }
}
