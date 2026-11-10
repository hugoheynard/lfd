import type { MandateBankExport } from "../domain/entities/mandate-bank-export.js";
import { LegalEntityNotFoundError } from "../domain/errors/accounting-errors.js";
import { MandateBankExportNotFoundError } from "../domain/errors/mandate-bank-export-errors.js";
import type { ExportEntity } from "../domain/events/mandate-bank-export.events.js";
import type { CompanyNamesReader } from "../domain/ports/company-names.reader.js";
import type { LegalEntityReader, LegalEntityRecord } from "../domain/ports/legal-entity.reader.js";
import type { MandateBankExportRepository } from "../domain/ports/mandate-bank-export.repository.js";
import type { MandateForBankExport } from "../domain/ports/mandates-for-bank-export.reader.js";
import { nameOf } from "../domain/services/collection-debit-drafts.js";
import { renderMandateBankCsv } from "../domain/services/mandate-bank-export-csv.js";

/** L'entité de la route, ou un 404 qui la nomme. @throws {LegalEntityNotFoundError} */
export async function exportEntityOrFail(
  entities: LegalEntityReader,
  legalEntityId: string,
): Promise<LegalEntityRecord> {
  const entity = await entities.byId(legalEntityId);
  if (entity === null) {
    throw new LegalEntityNotFoundError(legalEntityId);
  }
  return entity;
}

/**
 * L'export de CETTE entité, ou un 404 qui le nomme : un export d'une autre
 * entité n'existe pas pour elle. @throws {MandateBankExportNotFoundError}
 */
export async function mandateExportOrFail(
  exports: MandateBankExportRepository,
  legalEntityId: string,
  exportId: string,
): Promise<MandateBankExport> {
  const found = await exports.load(legalEntityId, exportId);
  if (found === null) {
    throw new MandateBankExportNotFoundError(exportId);
  }
  return found;
}

/** L'entité telle que le journal la cite. */
export function journalEntity(entity: LegalEntityRecord): ExportEntity {
  return { id: entity.id, name: entity.name };
}

/**
 * **Le fichier d'import des mandats** pour ces mandats de l'entité : le nom du
 * débiteur est celui du `pain.008` (§ 2 bis-7), lu par la même source que la
 * constitution du lot. Un seul rendu pour l'export groupé et pour l'essai.
 */
export async function mandateBankCsvOf(
  companies: CompanyNamesReader,
  entity: LegalEntityRecord,
  mandates: readonly MandateForBankExport[],
): Promise<string> {
  const names = await companies.companyNames([
    ...new Set(mandates.map((mandate) => mandate.debtorCompanyId)),
  ]);
  return renderMandateBankCsv(
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
}
