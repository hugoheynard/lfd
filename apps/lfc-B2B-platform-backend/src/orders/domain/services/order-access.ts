import { CompanyNotActivatedError, OrderCompanyNotFoundError } from "../errors/order-errors.js";
import type { OrderCompanyStatus, OrderRole } from "../ports/order-guard.reader.js";

/**
 * Mur de tenancy pour les commandes : il faut être **membre** de l'entreprise
 * visée. `null` (aucun rattachement) → 404 non-divulguant. Fonction pure — le rôle
 * vient d'un port, la décision reste testable sans infrastructure.
 *
 * @throws {OrderCompanyNotFoundError} le demandeur n'est pas membre.
 */
export function ensureOrderMember(role: OrderRole | null, companyId: string): void {
  if (role === null) {
    throw new OrderCompanyNotFoundError(companyId);
  }
}

/**
 * Droit de **commander** : l'entreprise doit être **activée** (règlement + KBIS
 * validés → `status = active`). Sinon, refus métier — le panier reste permis.
 *
 * `null` ne devrait pas arriver après `ensureOrderMember` (l'entreprise existe),
 * mais on le traite en 404 par prudence plutôt que de présenter un état incohérent.
 *
 * @throws {OrderCompanyNotFoundError} l'entreprise a disparu entre-temps.
 * @throws {CompanyNotActivatedError} l'entreprise existe mais n'est pas activée.
 */
export function ensureCanOrder(status: OrderCompanyStatus | null, companyId: string): void {
  if (status === null) {
    throw new OrderCompanyNotFoundError(companyId);
  }
  if (status !== "active") {
    throw new CompanyNotActivatedError(companyId);
  }
}
