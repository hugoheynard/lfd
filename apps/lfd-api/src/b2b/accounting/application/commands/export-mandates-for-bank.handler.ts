import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MandateBankExport } from "../../domain/entities/mandate-bank-export.js";
import { BankExportWithoutCreditorIdentifierError } from "../../domain/errors/mandate-bank-export-errors.js";
import { MandateBankExportCreatedEvent } from "../../domain/events/mandate-bank-export.events.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { MandateBankExportRepository } from "../../domain/ports/mandate-bank-export.repository.js";
import { ImportedMandateAccountsReader } from "../../domain/ports/mandate-bank-exports.reader.js";
import { MandatesForBankExportReader } from "../../domain/ports/mandates-for-bank-export.reader.js";
import {
  fingerprinted,
  selectForBankExport,
  type FingerprintedMandate,
} from "../../domain/services/mandate-bank-export-selection.js";
import { exportEntityOrFail, journalEntity } from "../mandate-bank-export-support.js";
import { ExportMandatesForBankCommand } from "./export-mandates-for-bank.command.js";

/**
 * **Prépare un export des mandats** (plan § 2 bis-1) : fige quels mandats
 * partent et sous quel compte (empreinte, jamais l'IBAN), et le dit au
 * journal. Le fichier, lui, n'est pas rangé — il se recalcule au
 * téléchargement.
 *
 * L'ICS est exigé ICI : la colonne B est obligatoire, et un export qu'on ne
 * pourrait pas télécharger ne doit pas exister.
 */
@CommandHandler(ExportMandatesForBankCommand)
export class ExportMandatesForBankHandler implements ICommandHandler<
  ExportMandatesForBankCommand,
  string
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly mandates: MandatesForBankExportReader,
    private readonly imported: ImportedMandateAccountsReader,
    private readonly exports: MandateBankExportRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ExportMandatesForBankCommand): Promise<string> {
    const at = this.clock.now();
    const entity = await exportEntityOrFail(this.entities, command.legalEntityId);
    if (entity.ics === "") {
      throw new BankExportWithoutCreditorIdentifierError(entity.name);
    }
    return this.uow.run(async () => {
      const chosen = await this.chosen(command);
      const bankExport = MandateBankExport.export({
        id: this.ids.next(),
        legalEntityId: entity.id,
        created: { at, staffId: command.staffUserId },
        lines: chosen.map(({ mandate, fingerprint }) => ({
          mandateId: mandate.mandateId,
          rum: mandate.reference,
          accountFingerprint: fingerprint,
        })),
      });
      await this.exports.save(bankExport);
      await this.events.publishTraced(
        new MandateBankExportCreatedEvent(bankExport, journalEntity(entity), at),
      );
      return bankExport.id;
    });
  }

  private async chosen(
    command: ExportMandatesForBankCommand,
  ): Promise<readonly FingerprintedMandate[]> {
    const { exportable } = await this.mandates.activeOf(command.legalEntityId);
    if (command.all) {
      return fingerprinted(exportable);
    }
    const imported = await this.imported.of(command.legalEntityId);
    return selectForBankExport(exportable, imported).toExport;
  }
}
