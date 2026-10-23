import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MandateBankLineCorrectedEvent } from "../../domain/events/mandate-bank-export.events.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { MandateBankExportRepository } from "../../domain/ports/mandate-bank-export.repository.js";
import {
  exportEntityOrFail,
  journalEntity,
  mandateExportOrFail,
} from "../mandate-bank-export-support.js";
import { ReportMandateKnownToBankCommand } from "./report-mandate-known-to-bank.command.js";

/**
 * **« Signalé comme connu par la banque »** (doc `prerequis-export-mandats.md`) : le mandat reste tenu pour importé. L'agrégat refuse un export
 * pas encore déposé, hors de la fenêtre du compte rendu, ou une ligne déjà
 * corrigée ; un export d'une autre entité est un 404.
 */
@CommandHandler(ReportMandateKnownToBankCommand)
export class ReportMandateKnownToBankHandler implements ICommandHandler<
  ReportMandateKnownToBankCommand,
  void
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly exports: MandateBankExportRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReportMandateKnownToBankCommand): Promise<void> {
    const stamp = { at: this.clock.now(), staffId: command.staffUserId };
    const entity = await exportEntityOrFail(this.entities, command.legalEntityId);
    await this.uow.run(async () => {
      const bankExport = await mandateExportOrFail(this.exports, entity.id, command.exportId);
      const line = bankExport.reportKnownByBank(command.mandateId, stamp);
      await this.exports.save(bankExport);
      await this.events.publishTraced(
        new MandateBankLineCorrectedEvent(line, line.correction, journalEntity(entity)),
      );
    });
  }
}
