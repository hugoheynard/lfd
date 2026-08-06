import { OrderCompanyNotFoundError } from "../errors/order-errors.js";
import type { OrderRole } from "../ports/order-guard.reader.js";

/**
 * Mur de tenancy pour les commandes rattachées à une entreprise : il faut en être
 * **membre**. `null` (aucun rattachement) → 404 non-divulguant. Fonction pure — le
 * rôle vient d'un port, la décision reste testable sans infrastructure.
 *
 * ⚠️ Ce mur ne s'applique QUE lorsqu'une entreprise est visée. Une commande
 * **personnelle** (sans entreprise) est murée par le seul `placedByUserId` : il n'y
 * a pas de `role` à vérifier — n'importe quel client connecté peut commander pour
 * lui-même. Le **droit de commander** n'a plus de gate d'activation (zéro friction) :
 * c'est le **terme** de règlement qui décide carte vs facturation différée.
 *
 * @throws {OrderCompanyNotFoundError} le demandeur n'est pas membre.
 */
export function ensureOrderMember(role: OrderRole | null, companyId: string): void {
  if (role === null) {
    throw new OrderCompanyNotFoundError(companyId);
  }
}
