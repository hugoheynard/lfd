import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { MandateBankExportNotFoundError } from "../../domain/errors/mandate-bank-export-errors.js";
import { CollectionCandidatesReader } from "../../domain/ports/collection-candidates.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { MandateBankExportsReader } from "../../domain/ports/mandate-bank-exports.reader.js";
import { MandatesForBankExportReader } from "../../domain/ports/mandates-for-bank-export.reader.js";
import { nameOf } from "../../domain/services/collection-debit-drafts.js";
import { renderMandateBankCsv } from "../../domain/services/mandate-bank-export-csv.js";
import { currentMandatesOf } from "../../domain/services/mandate-bank-export-selection.js";
import { exportEntityOrFail } from "../mandate-bank-export-support.js";
import { ExportMandateBankFileQuery } from "./mandate-bank-export-queries.js";

export interface MandateBankFile {
  readonly csv: string;
  readonly fileName: string;
}

/**
 * **Le fichier d'import des mandats** (plan § 2 bis-1) — recalculé à chaque
 * téléchargement depuis les mandats de l'export, jamais rangé : il porte les
 * IBAN en clair. Refusé (409) dès qu'un compte ne correspond plus à
 * l'empreinte figée, ou qu'un mandat n'est plus exportable.
 *
 * Le nom du débiteur est celui du `pain.008` (§ 2 bis-7) : la raison sociale
 * de la société débitrice, lue par la même source que la constitution du lot
 * (`CollectionCandidatesReader.companyNames`, puis `nameOf`).
 */
@QueryHandler(ExportMandateBankFileQuery)
export class ExportMandateBankFileHandler implements IQueryHandler<
  ExportMandateBankFileQuery,
  MandateBankFile
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly exports: MandateBankExportsReader,
    private readonly mandates: MandatesForBankExportReader,
    private readonly candidates: CollectionCandidatesReader,
  ) {}

  async execute(query: ExportMandateBankFileQuery): Promise<MandateBankFile> {
    const entity = await exportEntityOrFail(this.entities, query.legalEntityId);
    const lines = await this.exports.linesOf(entity.id, query.exportId);
    if (lines === null) {
      throw new MandateBankExportNotFoundError(query.exportId);
    }
    const { exportable } = await this.mandates.activeOf(entity.id);
    const mandates = currentMandatesOf(lines, exportable);
    const names = await this.candidates.companyNames([
      ...new Set(mandates.map((mandate) => mandate.debtorCompanyId)),
    ]);
    const csv = renderMandateBankCsv(
      mandates.map((mandate) => ({
        reference: mandate.reference,
        ics: entity.ics,
        debtorName: nameOf(mandate.debtorCompanyId, names),
        iban: mandate.iban,
        bic: mandate.bic,
        signedAt: mandate.signedAt,
        paymentType: mandate.paymentType,
        scheme: mandate.scheme,
      })),
    );
    return { csv, fileName: `mandats-banque-${entity.siren}-${query.exportId}.csv` };
  }
}
