import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { AccountBankExport } from "../../domain/entities/account-bank-export.js";
import { AccountBankExportEvent } from "../../domain/events/account-bank-export.events.js";
import { AccountBankExportRepository } from "../../domain/ports/account-bank-export.repository.js";
import { KnownAccountFingerprintsReader } from "../../domain/ports/account-bank-exports.reader.js";
import { AccountsForBankExportReader } from "../../domain/ports/accounts-for-bank-export.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { selectAccountsForBankExport } from "../../domain/services/account-bank-export-selection.js";
import { ACCOUNT_IMPORT_MAX_ROWS } from "../../domain/services/account-bank-export-values.js";
import { exportEntityOrFail, journalEntity } from "../mandate-bank-export-support.js";
import { ExportAccountsForBankCommand } from "./export-accounts-for-bank.command.js";

/**
 * **Prépare un export des comptes** (doc `prerequis-export-ribs.md` § 2.1 à
 * § 2.3) : fige quels comptes partent, par l'empreinte de leur IBAN, et le
 * dit au journal. Le fichier n'est pas rangé — il se recalcule au
 * téléchargement.
 *
 * « À exporter » se lit sur TOUT l'abonnement (R7) : un compte importé, en
 * vol ou déclaré connu depuis une autre entité ne repart pas. Les 200
 * premiers dans l'ordre de dépôt partent, les suivants attendent l'export
 * d'après (§ 2.2) — découper plutôt que refuser.
 */
@CommandHandler(ExportAccountsForBankCommand)
export class ExportAccountsForBankHandler implements ICommandHandler<
  ExportAccountsForBankCommand,
  string
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly accounts: AccountsForBankExportReader,
    private readonly fingerprints: KnownAccountFingerprintsReader,
    private readonly exports: AccountBankExportRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ExportAccountsForBankCommand): Promise<string> {
    const at = this.clock.now();
    const entity = await exportEntityOrFail(this.entities, command.legalEntityId);
    return this.uow.run(async () => {
      const [{ exportable }, fingerprints] = await Promise.all([
        this.accounts.debitedBy(entity.id),
        this.fingerprints.all(),
      ]);
      const chosen = selectAccountsForBankExport(exportable, fingerprints).toExport.slice(
        0,
        ACCOUNT_IMPORT_MAX_ROWS,
      );
      const bankExport = AccountBankExport.export({
        id: this.ids.next(),
        legalEntityId: entity.id,
        created: { at, staffId: command.staffUserId },
        lines: chosen.map(({ account, fingerprint }) => ({
          bankAccountId: account.bankAccountId,
          companyId: account.companyId,
          accountFingerprint: fingerprint,
        })),
      });
      await this.exports.save(bankExport);
      await this.events.publishTraced(
        new AccountBankExportEvent("created", bankExport, journalEntity(entity), at),
      );
      return bankExport.id;
    });
  }
}
