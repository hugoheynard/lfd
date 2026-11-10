import { NotOwnEstablishmentError } from "../domain/errors/collection-test-errors.js";
import type { CollectionMandatesReader } from "../domain/ports/collection-mandates.reader.js";
import type {
  EstablishmentCompaniesReader,
  EstablishmentCompany,
} from "../domain/ports/establishment-companies.reader.js";
import { ownSingleMandate, type TestMandate } from "../domain/services/collection-test-debtor.js";
import { establishmentCompanyOrFail } from "./own-establishment-support.js";

/** Un de nos établissements et le seul mandat sous lequel un essai le prélève. */
export interface EstablishmentMandate {
  readonly company: EstablishmentCompany;
  readonly mandate: TestMandate;
}

/**
 * **L'établissement déclaré et son mandat d'essai**, ou le refus qui dit
 * pourquoi pas — le point de départ commun des fichiers « Mandat » et « RIB »
 * d'un essai.
 *
 * @throws {NotOwnEstablishmentError} la société n'est pas déclarée à nous.
 * @throws le refus d'`ownSingleMandate` : aucun mandat, ou plusieurs.
 */
export async function establishmentMandateOrFail(
  companies: EstablishmentCompaniesReader,
  mandates: CollectionMandatesReader,
  companyId: string,
): Promise<EstablishmentMandate> {
  const company = await establishmentCompanyOrFail(companies, companyId);
  if (!company.declared) {
    throw new NotOwnEstablishmentError(company.name);
  }
  const carried = await mandates.activeFor([company.companyId]);
  const own = ownSingleMandate(
    company.name,
    carried.filter((mandate) => mandate.companyId === company.companyId),
  );
  if (own.kind === "refused") {
    throw own.refusal;
  }
  return { company, mandate: own.mandate };
}
