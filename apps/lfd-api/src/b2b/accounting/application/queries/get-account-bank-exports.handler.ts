import type { AccountBankExportsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  AccountBankExportsReader,
  KnownAccountFingerprintsReader,
} from "../../domain/ports/account-bank-exports.reader.js";
import { AccountsForBankExportReader } from "../../domain/ports/accounts-for-bank-export.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { selectAccountsForBankExport } from "../../domain/services/account-bank-export-selection.js";
import { ACCOUNT_IMPORT_MAX_ROWS } from "../../domain/services/account-bank-export-values.js";
import { exportEntityOrFail } from "../mandate-bank-export-support.js";
import { GetAccountBankExportsQuery } from "./account-bank-export-queries.js";

/**
 * **La carte « Comptes à la banque »** : les comptes à exporter, nommés (le
 * geste « déjà connu » les désigne), combien sont en vol ou connus, les
 * écartés et pourquoi, et les exports passés. Les IBAN sont descellés pour
 * leur empreinte, et rien n'en sort.
 */
@QueryHandler(GetAccountBankExportsQuery)
export class GetAccountBankExportsHandler implements IQueryHandler<
  GetAccountBankExportsQuery,
  AccountBankExportsView
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly accounts: AccountsForBankExportReader,
    private readonly fingerprints: KnownAccountFingerprintsReader,
    private readonly exports: AccountBankExportsReader,
  ) {}

  async execute(query: GetAccountBankExportsQuery): Promise<AccountBankExportsView> {
    const entity = await exportEntityOrFail(this.entities, query.legalEntityId);
    const [{ exportable, excluded }, fingerprints, exports] = await Promise.all([
      this.accounts.debitedBy(entity.id),
      this.fingerprints.all(),
      this.exports.list(entity.id),
    ]);
    const selection = selectAccountsForBankExport(exportable, fingerprints);
    return {
      debitedCount: selection.toExport.length + selection.inFlight.length + selection.known.length,
      toExport: selection.toExport.map(({ account }) => ({
        bankAccountId: account.bankAccountId,
        companyName: account.companyName,
        ibanLast4: account.ibanLast4,
      })),
      inFlightCount: selection.inFlight.length,
      knownCount: selection.known.length,
      maxPerExport: ACCOUNT_IMPORT_MAX_ROWS,
      excluded: excluded.map((account) => ({ ...account })),
      exports: exports.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        accountCount: row.accountCount,
        importedAt: row.importedAt?.toISOString() ?? null,
        abandonedAt: row.abandonedAt?.toISOString() ?? null,
      })),
    };
  }
}
