import {
  UnpaidCompanyNotFoundError,
  UnpaidRoleRequiredError,
} from "../errors/unpaid-access-errors.js";
import type { UnpaidAccessRole } from "../ports/unpaid-access.reader.js";

/** Ceux qui voient ce qui reste à régler : les mêmes que pour le RIB. */
const UNPAID_ROLES: ReadonlySet<UnpaidAccessRole> = new Set(["owner", "billing"]);

/**
 * Le mur des impayés côté client. Même partage que le RIB : aucun
 * rattachement → 404 non-divulguant ; membre sans le rôle → 403.
 *
 * @throws {UnpaidCompanyNotFoundError} le demandeur n'est pas membre.
 * @throws {UnpaidRoleRequiredError} membre, mais ni détenteur ni facturation.
 */
export function ensureUnpaidAccess(role: UnpaidAccessRole | null, companyId: string): void {
  if (role === null) {
    throw new UnpaidCompanyNotFoundError(companyId);
  }
  if (!UNPAID_ROLES.has(role)) {
    throw new UnpaidRoleRequiredError(companyId);
  }
}
