import type { CompanyStanding } from "./company-standing.js";
import { INHERITING_PARENT_ROLES } from "./effective-role.js";

/**
 * **Qui écrit la carte d'un sous-compte, côté client**
 * (`documentation/comptes-client/plan-carte-des-sites.md`, § 3.2) : le
 * propriétaire ou un administrateur du principal ACTIF qui ouvre ce
 * sous-compte — `standing.via`, déjà réduit par la requête partagée à un
 * principal `active`, un site non suspendu et une membership acceptée.
 *
 * 🔴 `standing.own` n'est jamais lu. Le rôle effectif (`standingRole`)
 * est le MAX du propre et de l'hérité : il laisserait le propriétaire du
 * sous-compte lever la carte que son principal lui pose. Un membre du site,
 * quel que soit son rôle, ne l'écrit donc pas — il la lit dans son rayon.
 */
export function canSetMenuOf(standing: CompanyStanding | null): boolean {
  const via = standing?.via ?? null;
  return via !== null && INHERITING_PARENT_ROLES.includes(via.role);
}
