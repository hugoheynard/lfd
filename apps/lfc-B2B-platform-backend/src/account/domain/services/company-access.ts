import { CompanyAdminRequiredError, CompanyNotFoundError } from "../errors/account-errors.js";
import type { CompanyRole } from "../value-objects/company-role.js";

/**
 * Le **mur de tenancy**, exprimé une fois pour toutes.
 *
 * Une opération sur une entreprise existante n'est légitime que si le demandeur
 * y est rattaché. Le tenant ne se déduit plus de l'utilisateur (une personne a
 * 0..N entreprises) : l'entreprise visée est **passée** par la requête, et
 * vérifiée ici contre le rôle réel du demandeur dans cette entreprise.
 *
 * Fonction **pure** : elle ne lit rien, elle décide à partir du rôle qu'on lui
 * donne. Le rôle vient d'un port (`MembershipReader`), la décision reste
 * testable sans infrastructure.
 *
 * Deux refus distincts et volontaires :
 * - `null` (aucun rattachement) → **404** : on ne divulgue pas l'existence de
 *   l'entreprise à quelqu'un qui n'en est pas membre.
 * - `member` → **403** : il en est membre, mais gérer les contacts est réservé
 *   au gestionnaire.
 *
 * @throws {CompanyNotFoundError} le demandeur n'est pas membre.
 * @throws {CompanyAdminRequiredError} membre, mais pas gestionnaire.
 */
export function ensureCompanyAdmin(role: CompanyRole | null, companyId: string): void {
  if (role === null) {
    throw new CompanyNotFoundError(companyId);
  }
  if (role !== "owner" && role !== "admin") {
    throw new CompanyAdminRequiredError(companyId);
  }
}

/**
 * Variante « simple appartenance » : n'importe quel rôle passe, seul l'absence de
 * rattachement échoue (404 non-divulguant). Pour les lectures d'une entreprise
 * — voir/télécharger le KBIS — où être membre suffit, sans être gestionnaire.
 *
 * @throws {CompanyNotFoundError} le demandeur n'est pas membre.
 */
export function ensureCompanyMember(role: CompanyRole | null, companyId: string): void {
  if (role === null) {
    throw new CompanyNotFoundError(companyId);
  }
}
