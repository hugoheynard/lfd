import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { accountExportFileNameOf } from "../bank-export-naming-support.js";
import {
  AccountBankExportClosedError,
  AccountBankExportNotFoundError,
} from "../../domain/errors/account-bank-export-errors.js";
import { AccountBankExportsReader } from "../../domain/ports/account-bank-exports.reader.js";
import { AccountsForBankExportReader } from "../../domain/ports/accounts-for-bank-export.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { currentAccountsOf } from "../../domain/services/account-bank-export-selection.js";
import { accountBankCsvOf } from "../account-bank-export-support.js";
import { exportEntityOrFail } from "../mandate-bank-export-support.js";
import { ExportAccountBankFileQuery } from "./account-bank-export-queries.js";

export interface AccountBankFile {
  readonly csv: string;
  readonly fileName: string;
}

/**
 * **Le fichier des comptes destinataires** (doc `prerequis-export-ribs.md`
 * § 1, § 2.3) — recalculé à chaque téléchargement depuis les comptes de
 * l'export, jamais rangé : il n'est fait que d'IBAN en clair. Refusé (409) dès
 * qu'un compte ne correspond plus à l'empreinte figée, ou que l'export est
 * abandonné. Le journal du téléchargement est une COMMANDE à part, que la
 * route envoie une fois le fichier calculé : une lecture n'écrit rien.
 */
@QueryHandler(ExportAccountBankFileQuery)
export class ExportAccountBankFileHandler implements IQueryHandler<
  ExportAccountBankFileQuery,
  AccountBankFile
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly exports: AccountBankExportsReader,
    private readonly accounts: AccountsForBankExportReader,
  ) {}

  async execute(query: ExportAccountBankFileQuery): Promise<AccountBankFile> {
    const entity = await exportEntityOrFail(this.entities, query.legalEntityId);
    const file = await this.exports.fileOf(entity.id, query.exportId);
    if (file === null) {
      throw new AccountBankExportNotFoundError(query.exportId);
    }
    if (file.abandonedAt !== null) {
      throw new AccountBankExportClosedError("abandoned", file.abandonedAt);
    }
    const { exportable } = await this.accounts.debitedBy(entity.id);
    const csv = accountBankCsvOf(currentAccountsOf(file.lines, exportable));
    return { csv, fileName: accountExportFileNameOf(file) };
  }
}
