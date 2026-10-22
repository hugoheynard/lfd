import { CollectionTestCompanyNotFoundError } from "../domain/errors/collection-test-errors.js";
import type {
  EstablishmentCompaniesReader,
  EstablishmentCompany,
} from "../domain/ports/establishment-companies.reader.js";

/** La société, ou le 404 qui nomme l'identifiant. */
export async function establishmentCompanyOrFail(
  companies: EstablishmentCompaniesReader,
  companyId: string,
): Promise<EstablishmentCompany> {
  const company = await companies.companyOf(companyId);
  if (company === null) {
    throw new CollectionTestCompanyNotFoundError(companyId);
  }
  return company;
}
