import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { KnownBankAccount } from "../../domain/entities/known-bank-account.js";
import { AccountNotDebitedByEntityError } from "../../domain/errors/account-bank-export-errors.js";
import { BankAccountDeclaredKnownEvent } from "../../domain/events/account-bank-export.events.js";
import { KnownBankAccountRepository } from "../../domain/ports/account-bank-export.repository.js";
import { KnownAccountFingerprintsReader } from "../../domain/ports/account-bank-exports.reader.js";
import { AccountsForBankExportReader } from "../../domain/ports/accounts-for-bank-export.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { accountFingerprint } from "../../domain/services/account-fingerprint.js";
import { exportEntityOrFail, journalEntity } from "../mandate-bank-export-support.js";
import { DeclareBankAccountKnownCommand } from "./declare-bank-account-known.command.js";

/**
 * **« Connu de la banque »** (doc `prerequis-export-ribs.md` § 2.6,
 * vitruve objection 1) : pose l'empreinte du compte sans fichier, avec sa
 * raison, son auteur et un fait au journal qui la dit. Le compte doit être débité par un mandat actif de
 * l'entité de la route — c'est le mur ; l'entité refuse une empreinte déjà
 * connue, « saisi dans CENET » sur un compte en vol, et « signalé par la
 * banque » hors d'un export téléchargé.
 */
@CommandHandler(DeclareBankAccountKnownCommand)
export class DeclareBankAccountKnownHandler implements ICommandHandler<
  DeclareBankAccountKnownCommand,
  string
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly accounts: AccountsForBankExportReader,
    private readonly fingerprints: KnownAccountFingerprintsReader,
    private readonly known: KnownBankAccountRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DeclareBankAccountKnownCommand): Promise<string> {
    const at = this.clock.now();
    const entity = await exportEntityOrFail(this.entities, command.legalEntityId);
    return this.uow.run(async () => {
      const [{ exportable }, fingerprints] = await Promise.all([
        this.accounts.debitedBy(entity.id),
        this.fingerprints.all(),
      ]);
      const account = exportable.find((row) => row.bankAccountId === command.bankAccountId);
      if (account === undefined) {
        throw new AccountNotDebitedByEntityError(command.bankAccountId);
      }
      const declared = KnownBankAccount.declare(
        {
          id: this.ids.next(),
          legalEntityId: entity.id,
          bankAccountId: account.bankAccountId,
          companyId: account.companyId,
          companyName: account.companyName,
          accountFingerprint: accountFingerprint(account.iban),
          declared: { at, staffId: command.staffUserId },
          reason: command.reason,
        },
        fingerprints,
      );
      await this.known.add(declared);
      await this.events.publishTraced(
        new BankAccountDeclaredKnownEvent(
          declared.toPersistence(),
          account.companyName,
          journalEntity(entity),
        ),
      );
      return declared.toPersistence().id;
    });
  }
}
