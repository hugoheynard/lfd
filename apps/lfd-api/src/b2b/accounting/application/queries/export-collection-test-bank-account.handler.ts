import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CollectionTestBankAccountNotExportableError } from "../../domain/errors/collection-test-bank-account-errors.js";
import type { TestSubject } from "../../domain/events/collection-test.events.js";
import type { ExportEntity } from "../../domain/events/mandate-bank-export.events.js";
import {
  AccountsForBankExportReader,
  type AccountForBankExport,
} from "../../domain/ports/accounts-for-bank-export.reader.js";
import { CollectionMandatesReader } from "../../domain/ports/collection-mandates.reader.js";
import { EstablishmentCompaniesReader } from "../../domain/ports/establishment-companies.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { accountFingerprint } from "../../domain/services/account-fingerprint.js";
import type { TestMandate } from "../../domain/services/collection-test-debtor.js";
import { accountBankCsvOf } from "../account-bank-export-support.js";
import { establishmentMandateOrFail } from "../collection-test-mandate-support.js";
import { exportEntityOrFail, journalEntity } from "../mandate-bank-export-support.js";
import { ExportCollectionTestBankAccountQuery } from "./collection-test-queries.js";

/**
 * Le fichier, et de quoi le journaliser : la route envoie ensuite la commande
 * du téléchargement, comme celle de l'export réel — une lecture n'écrit rien.
 */
export interface CollectionTestBankAccountFile {
  readonly csv: string;
  readonly fileName: string;
  readonly company: TestSubject;
  readonly legalEntity: ExportEntity;
}

/**
 * **Le RIB d'un établissement, pour la banque** — le fichier des comptes
 * destinataires de l'export des RIB (même rendu `accountBankCsvOf`, même
 * en-tête, même encodage), réduit au seul compte que débite le mandat de
 * l'essai.
 *
 * 🔴 Une LECTURE : il ne fige aucun export et ne marque rien. L'export groupé
 * de l'entité garde ce compte « à exporter » tant qu'un de SES exports n'a pas
 * été marqué importé : le fichier de l'essai n'atteste pas que la banque l'a
 * reçu. Fait d'un IBAN en clair, il n'est jamais rangé — recalculé à chaque
 * téléchargement.
 */
@QueryHandler(ExportCollectionTestBankAccountQuery)
export class ExportCollectionTestBankAccountHandler implements IQueryHandler<
  ExportCollectionTestBankAccountQuery,
  CollectionTestBankAccountFile
> {
  constructor(
    private readonly companies: EstablishmentCompaniesReader,
    private readonly mandates: CollectionMandatesReader,
    private readonly accounts: AccountsForBankExportReader,
    private readonly entities: LegalEntityReader,
  ) {}

  async execute(
    query: ExportCollectionTestBankAccountQuery,
  ): Promise<CollectionTestBankAccountFile> {
    const { company, mandate } = await establishmentMandateOrFail(
      this.companies,
      this.mandates,
      query.companyId,
    );
    const entity = await exportEntityOrFail(this.entities, mandate.creditorId);
    const account = await this.debitedAccount(entity.id, mandate, company.name);
    return {
      csv: accountBankCsvOf([account]),
      fileName: `ESSAI-rib-banque-${entity.siren}-${mandate.reference}.csv`,
      company: { companyId: company.companyId, name: company.name },
      legalEntity: journalEntity(entity),
    };
  }

  /**
   * Le compte que débite CE mandat, reconnu par l'empreinte de son IBAN — le
   * lecteur de l'export ne rend pas le mandat d'un compte (R5 : un compte
   * pour plusieurs mandats).
   */
  private async debitedAccount(
    legalEntityId: string,
    mandate: TestMandate,
    companyName: string,
  ): Promise<AccountForBankExport> {
    const { exportable } = await this.accounts.debitedBy(legalEntityId);
    const fingerprint = accountFingerprint(mandate.iban);
    const found = exportable.find((each) => accountFingerprint(each.iban) === fingerprint);
    if (found !== undefined) {
      return found;
    }
    throw new CollectionTestBankAccountNotExportableError(
      companyName,
      mandate.reference,
      mandate.bic === null || mandate.bic === "" ? "no_bic" : "not_debited",
    );
  }
}
