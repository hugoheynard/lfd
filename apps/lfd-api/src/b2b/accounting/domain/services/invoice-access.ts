import {
  InvoiceCompanyNotFoundError,
  InvoiceRoleRequiredError,
} from "../errors/invoice-access-errors.js";
import type { UnpaidAccessRole } from "../ports/unpaid-access.reader.js";

/**
 * Ceux qui voient les factures : le détenteur, l'administrateur et la
 * facturation. L'administrateur y entre le 2026-10-21 (Hugo : « admin doit
 * voir les factures ») ; le RIB et les impayés gardent leur propre mur.
 */
const INVOICE_ROLES: ReadonlySet<UnpaidAccessRole> = new Set(["owner", "admin", "billing"]);

/**
 * Le mur de « Mes factures » côté client (E6) — même partage que le RIB :
 * aucun rattachement → 404 non-divulguant ; membre sans le rôle → 403. Le
 * rôle se lit par `UnpaidAccessReader`, le port du rôle de la comptabilité.
 *
 * @throws {InvoiceCompanyNotFoundError} le demandeur n'est pas membre.
 * @throws {InvoiceRoleRequiredError} membre, mais ni détenteur, ni administrateur, ni facturation.
 */
export function ensureInvoiceAccess(role: UnpaidAccessRole | null, companyId: string): void {
  if (role === null) {
    throw new InvoiceCompanyNotFoundError(companyId);
  }
  if (!INVOICE_ROLES.has(role)) {
    throw new InvoiceRoleRequiredError(companyId);
  }
}
