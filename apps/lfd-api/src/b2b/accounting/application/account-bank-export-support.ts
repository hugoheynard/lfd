import { AccountBankExport } from "../domain/entities/account-bank-export.js";
import { AccountBankExportNotFoundError } from "../domain/errors/account-bank-export-errors.js";
import type { AccountBankExportRepository } from "../domain/ports/account-bank-export.repository.js";
import type { AccountForBankExport } from "../domain/ports/accounts-for-bank-export.reader.js";
import { renderAccountBankCsv } from "../domain/services/account-bank-export-csv.js";

/** L'export de CETTE entité, ou un 404 qui le nomme. @throws {AccountBankExportNotFoundError} */
export async function accountExportOrFail(
  exports: AccountBankExportRepository,
  legalEntityId: string,
  exportId: string,
): Promise<AccountBankExport> {
  const found = await exports.load(legalEntityId, exportId);
  if (found === null) {
    throw new AccountBankExportNotFoundError(exportId);
  }
  return found;
}

/**
 * **Le fichier des comptes destinataires** pour ces comptes. La colonne B est
 * le TITULAIRE du RIB (R6, choix du 2026-10-23, doc § 7) : si la banque
 * rattache un compte à son mandat par le nom (Q-B5), c'est ici qu'on met
 * `companyName` à la place de `holder`.
 */
export function accountBankCsvOf(accounts: readonly AccountForBankExport[]): string {
  return renderAccountBankCsv(
    accounts.map((account) => ({
      companyName: account.companyName,
      holder: account.holder,
      siren: account.siren,
      addressLine1: account.addressLine1,
      addressLine2: account.addressLine2,
      postalCode: account.postalCode,
      city: account.city,
      countryCode: account.countryCode,
      iban: account.iban,
      bic: account.bic,
    })),
  );
}
