import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { mandateExportFileNameOf } from "../bank-export-naming-support.js";
import {
  MandateBankExportAbandonedError,
  MandateBankExportNotFoundError,
} from "../../domain/errors/mandate-bank-export-errors.js";
import { CompanyNamesReader } from "../../domain/ports/company-names.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { MandateBankExportsReader } from "../../domain/ports/mandate-bank-exports.reader.js";
import { MandatesForBankExportReader } from "../../domain/ports/mandates-for-bank-export.reader.js";
import { currentMandatesOf } from "../../domain/services/mandate-bank-export-selection.js";
import { exportEntityOrFail, mandateBankCsvOf } from "../mandate-bank-export-support.js";
import { ExportMandateBankFileQuery } from "./mandate-bank-export-queries.js";

export interface MandateBankFile {
  readonly csv: string;
  readonly fileName: string;
}

/**
 * **Le fichier d'import des mandats** (plan § 2 bis-1) — recalculé à chaque
 * téléchargement depuis les mandats de l'export, jamais rangé : il porte les
 * IBAN en clair. Refusé (409) dès qu'un compte ne correspond plus à
 * l'empreinte figée, qu'un mandat n'est plus exportable, ou que l'export est
 * abandonné. Le journal du téléchargement (R8) est une COMMANDE à part, que
 * la route envoie une fois le fichier calculé : une lecture n'écrit rien.
 *
 * Le nom du débiteur est celui du `pain.008` (§ 2 bis-7) : la raison sociale
 * de la société débitrice, lue par la même source que la constitution du lot
 * (`CompanyNamesReader.companyNames`, puis `nameOf`).
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
    private readonly companies: CompanyNamesReader,
  ) {}

  async execute(query: ExportMandateBankFileQuery): Promise<MandateBankFile> {
    const entity = await exportEntityOrFail(this.entities, query.legalEntityId);
    const file = await this.exports.fileOf(entity.id, query.exportId);
    if (file === null) {
      throw new MandateBankExportNotFoundError(query.exportId);
    }
    if (file.abandonedAt !== null) {
      throw new MandateBankExportAbandonedError(file.abandonedAt);
    }
    const { exportable } = await this.mandates.activeOf(entity.id);
    const mandates = currentMandatesOf(file.lines, exportable);
    const csv = await mandateBankCsvOf(this.companies, entity, mandates);
    return { csv, fileName: mandateExportFileNameOf(file) };
  }
}
