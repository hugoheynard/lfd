import type { CompanyParentReader } from "../../account/domain/ports/company-parent.reader.js";
import {
  NotAPrincipalError,
  NoticePrincipalNotFoundError,
} from "../domain/errors/sub-account-notice-errors.js";

/**
 * Garde partagée par la lecture et les écritures du tableau : la société
 * existe et n'est le sous-compte de personne.
 *
 * @throws {NoticePrincipalNotFoundError} la société n'existe pas.
 * @throws {NotAPrincipalError} la société est rattachée à un principal.
 */
export async function ensurePrincipal(
  parents: CompanyParentReader,
  companyId: string,
): Promise<void> {
  const place = await parents.parentOf(companyId);
  if (place === null) {
    throw new NoticePrincipalNotFoundError(companyId);
  }
  if (place.parentCompanyId !== null) {
    throw new NotAPrincipalError(companyId, place.parentCompanyId);
  }
}
