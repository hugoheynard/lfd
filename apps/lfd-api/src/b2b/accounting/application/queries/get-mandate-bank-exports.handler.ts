import type { MandateBankExportsView, MandateBankStandingView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { mandateExportFileNameOf } from "../bank-export-naming-support.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CollectionCandidatesReader } from "../../domain/ports/collection-candidates.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import {
  ImportedMandateAccountsReader,
  MandateBankExportsReader,
  MandateBankLinesReader,
} from "../../domain/ports/mandate-bank-exports.reader.js";
import { MandatesForBankExportReader } from "../../domain/ports/mandates-for-bank-export.reader.js";
import { nameOf } from "../../domain/services/collection-debit-drafts.js";
import { selectForBankExport } from "../../domain/services/mandate-bank-export-selection.js";
import { exportEntityOrFail } from "../mandate-bank-export-support.js";
import { GetMandateBankExportsQuery } from "./mandate-bank-export-queries.js";
import { mandateBankRows } from "./mandate-bank-rows.js";

/**
 * **La carte « Mandats à la banque »** : combien sont à exporter, combien la
 * banque a déjà, lesquels sont écartés et pourquoi, chaque mandat et où il
 * en est (2026-10-23), et les exports passés.
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
    private readonly lines: MandateBankLinesReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetMandateBankExportsQuery): Promise<MandateBankExportsView> {
    const entity = await exportEntityOrFail(this.entities, query.legalEntityId);
    const [{ exportable, excluded }, imported, exports, lines] = await Promise.all([
      this.mandates.activeOf(entity.id),
      this.imported.of(entity.id),
      this.exports.list(entity.id),
      this.lines.linesOf(entity.id),
    ]);
    const selection = selectForBankExport(exportable, imported);
    const names = await this.candidates.companyNames([
      ...new Set([...exportable, ...excluded].map((mandate) => mandate.debtorCompanyId)),
    ]);
    const rows = mandateBankRows(exportable, excluded, lines, names, this.clock.now());
    // Les compteurs se lisent sur les lignes du tableau, pas sur la sélection :
    // un mandat d'un export ouvert y est « en export », il n'est plus « à
    // exporter » (Hugo, 2026-10-23, aligné sur la carte des comptes).
    const countOf = (kind: MandateBankStandingView["kind"]): number =>
      rows.filter((row) => row.standing.kind === kind).length;
    return {
      exportableCount: exportable.length,
      toExportCount: countOf("to_export"),
      inFlightCount: countOf("in_flight"),
      importedCount: selection.alreadyImported.length,
      excluded: excluded.map((mandate) => ({
        reference: mandate.reference,
        debtorName: nameOf(mandate.debtorCompanyId, names),
        reason: mandate.reason,
      })),
      mandates: rows,
      exports: exports.map((row) => ({
        id: row.id,
        reference: row.reference,
        part: row.part,
        fileName: mandateExportFileNameOf(row),
        createdAt: row.createdAt.toISOString(),
        mandateCount: row.mandateCount,
        lastDownloadedAt: row.lastDownloadedAt?.toISOString() ?? null,
        importedAt: row.importedAt?.toISOString() ?? null,
        abandonedAt: row.abandonedAt?.toISOString() ?? null,
      })),
    };
  }
}
