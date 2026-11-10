import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { AccountBankExport } from "../../domain/entities/account-bank-export.js";
import { AccountBankExportEvent } from "../../domain/events/account-bank-export.events.js";
import { AccountBankExportRepository } from "../../domain/ports/account-bank-export.repository.js";
import { KnownAccountFingerprintsReader } from "../../domain/ports/account-bank-exports.reader.js";
import { BankExportPreparationLock } from "../../domain/ports/bank-export-preparation-lock.js";
import { AccountBankExportNumbering } from "../../domain/ports/bank-export-numbering.js";
import { AccountsForBankExportReader } from "../../domain/ports/accounts-for-bank-export.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { selectAccountsForBankExport } from "../../domain/services/account-bank-export-selection.js";
import {
  BANK_EXPORT_PREFIXES,
  bankExportReferenceOf,
  exportPartOf,
} from "../../domain/services/bank-export-reference.js";
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
 *
 * Le numéro `EXC-<n>` et le rang « k sur N » se prennent ici, dans la
 * transaction, et se figent avec l'export (doc `procedure-de-prelevement.md`,
 * « Les identifiants courts et les noms de fichiers »).
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
    private readonly numbering: AccountBankExportNumbering,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly lock: BankExportPreparationLock,
  ) {}

  async execute(command: ExportAccountsForBankCommand): Promise<string> {
    const at = this.clock.now();
    const entity = await exportEntityOrFail(this.entities, command.legalEntityId);
    return this.uow.run(async () => {
      // AVANT toute lecture : une préparation concurrente a écrit ses lignes et
      // pris son numéro quand on lit « en vol » (prerequis-export-ribs.md § 8).
      await this.lock.acquire(entity.id, "accounts");
      const [{ exportable }, fingerprints] = await Promise.all([
        this.accounts.debitedBy(entity.id),
        this.fingerprints.all(),
      ]);
      const queue = selectAccountsForBankExport(exportable, fingerprints).toExport;
      const chosen = queue.slice(0, ACCOUNT_IMPORT_MAX_ROWS);
      const previous = await this.numbering.lastPart(entity.id);
      const bankExport = AccountBankExport.export({
        id: this.ids.next(),
        reference: bankExportReferenceOf(
          BANK_EXPORT_PREFIXES.accounts,
          await this.numbering.nextRank(),
        ),
        part: exportPartOf(previous, queue.length, ACCOUNT_IMPORT_MAX_ROWS),
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
