import {
  BankAccountCompanyNotFoundError,
  BankAccountRoleRequiredError,
} from "../errors/bank-account-errors.js";
import type { BankAccountRole } from "../ports/bank-account-guard.reader.js";

/**
 * Les rôles qui voient et déposent le RIB : le **détenteur**, et le rôle
 * **comptable**. `admin` administre l'espace (interlocuteurs, adresses) et
 * `orders` passe les commandes — ni l'un ni l'autre n'a à lire le compte qu'on
 * prélève (plan `documentation/b2b/plan-rib-client.md`, §2).
 */
const BANK_ACCOUNT_ROLES: ReadonlySet<BankAccountRole> = new Set(["owner", "billing"]);

/**
 * Le **mur du RIB** côté client. Fonction pure : le rôle vient d'un port, la
 * décision reste testable sans infrastructure.
 *
 * Même partage des refus que `ensureCompanyAdmin` : aucun rattachement → 404
 * non-divulguant ; membre sans le rôle → 403.
 *
 * @throws {BankAccountCompanyNotFoundError} le demandeur n'est pas membre.
 * @throws {BankAccountRoleRequiredError} membre, mais ni détenteur ni facturation.
 */
export function ensureBankAccountAccess(role: BankAccountRole | null, companyId: string): void {
  if (role === null) {
    throw new BankAccountCompanyNotFoundError(companyId);
  }
  if (!BANK_ACCOUNT_ROLES.has(role)) {
    throw new BankAccountRoleRequiredError(companyId);
  }
}
