import type { MandateBankExportsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CollectionCandidatesReader } from "../../domain/ports/collection-candidates.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import {
  ImportedMandateAccountsReader,
  MandateBankExportsReader,
} from "../../domain/ports/mandate-bank-exports.reader.js";
import { MandatesForBankExportReader } from "../../domain/ports/mandates-for-bank-export.reader.js";
import { nameOf } from "../../domain/services/collection-debit-drafts.js";
import { selectForBankExport } from "../../domain/services/mandate-bank-export-selection.js";
import { exportEntityOrFail } from "../mandate-bank-export-support.js";
import { GetMandateBankExportsQuery } from "./mandate-bank-export-queries.js";

/**
 * **La carte « Mandats à la banque »** : combien sont à exporter, combien la
 * banque a déjà, lesquels sont écartés et pourquoi, et les exports passés.
 * Les comptes sont descellés pour leur empreinte, et rien n'en sort.
 */
@QueryHandler(GetMandateBankExportsQuery)
export class GetMandateBankExportsHandler implements IQueryHandler<
  GetMandateBankExportsQuery,
  MandateBankExportsView
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly mandates: MandatesForBankExportReader,
    private readonly imported: ImportedMandateAccountsReader,
    private readonly exports: MandateBankExportsReader,
    private readonly candidates: CollectionCandidatesReader,
  ) {}

  async execute(query: GetMandateBankExportsQuery): Promise<MandateBankExportsView> {
    const entity = await exportEntityOrFail(this.entities, query.legalEntityId);
    const [{ exportable, excluded }, imported, exports] = await Promise.all([
      this.mandates.activeOf(entity.id),
      this.imported.of(entity.id),
      this.exports.list(entity.id),
    ]);
    const selection = selectForBankExport(exportable, imported);
    const names = await this.candidates.companyNames([
      ...new Set(excluded.map((mandate) => mandate.debtorCompanyId)),
    ]);
    return {
      exportableCount: exportable.length,
      toExportCount: selection.toExport.length,
      importedCount: selection.alreadyImported.length,
      excluded: excluded.map((mandate) => ({
        reference: mandate.reference,
        debtorName: nameOf(mandate.debtorCompanyId, names),
        reason: mandate.reason,
      })),
      exports: exports.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        mandateCount: row.mandateCount,
        importedAt: row.importedAt?.toISOString() ?? null,
      })),
    };
  }
}
