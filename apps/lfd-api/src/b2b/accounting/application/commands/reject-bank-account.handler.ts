import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { AccountBankLineCorrectedEvent } from "../../domain/events/account-bank-export.events.js";
import { AccountBankExportRepository } from "../../domain/ports/account-bank-export.repository.js";
import { CollectionCandidatesReader } from "../../domain/ports/collection-candidates.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { nameOf } from "../../domain/services/collection-debit-drafts.js";
import { accountExportOrFail } from "../account-bank-export-support.js";
import { exportEntityOrFail, journalEntity } from "../mandate-bank-export-support.js";
import { RejectBankAccountCommand } from "./reject-bank-account.command.js";

/**
 * **« Rejeté par la banque »** (doc `prerequis-export-ribs.md` § 2.6) : le compte redevient « à exporter », le motif va au journal. L'agrégat refuse un export
 * pas encore déposé, hors de la fenêtre du compte rendu, ou une ligne déjà
 * corrigée ; un export d'une autre entité est un 404.
 */
@CommandHandler(RejectBankAccountCommand)
export class RejectBankAccountHandler implements ICommandHandler<RejectBankAccountCommand, void> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly exports: AccountBankExportRepository,
    private readonly candidates: CollectionCandidatesReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RejectBankAccountCommand): Promise<void> {
    const stamp = { at: this.clock.now(), staffId: command.staffUserId };
    const entity = await exportEntityOrFail(this.entities, command.legalEntityId);
    await this.uow.run(async () => {
      const bankExport = await accountExportOrFail(this.exports, entity.id, command.exportId);
      const line = bankExport.rejectAccount(command.bankAccountId, stamp, command.reason);
      await this.exports.save(bankExport);
      const names = await this.candidates.companyNames([line.companyId]);
      await this.events.publishTraced(
        new AccountBankLineCorrectedEvent(
          line,
          line.correction,
          nameOf(line.companyId, names),
          journalEntity(entity),
        ),
      );
    });
  }
}
