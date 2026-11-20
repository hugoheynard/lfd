import type { CompanyStanding } from "./company-standing.js";
import { INHERITING_PARENT_ROLES } from "./effective-role.js";

/**
 * **Qui écrit la carte d'un sous-compte, côté client**
 * (`documentation/comptes-client/carte-des-sites.md`, § 3.2) : le
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

/**
 * **Qui lit la carte d'un site** (décidé par Hugo le 2026-11-20 : « le site
 * lit mais ne paramètre pas ») : celui qui l'écrit ({@link canSetMenuOf}),
 * et tout membre ACCEPTÉ du site, quel que soit son rôle propre — en lecture
 * seule. Un frère ou un principal étranger n'ont ni l'un ni l'autre.
 */
export function canReadSiteMenuOf(standing: CompanyStanding | null): boolean {
  if (canSetMenuOf(standing)) {
    return true;
  }
  return standing !== null && standing.own !== null && standing.ownAccepted;
}

/**
 * **Qui écrit la carte commune des sites d'un principal, côté client**
 * (`carte-des-sites.md`, § 6.1, § 6.4) : le propriétaire ou un
 * administrateur de CE principal — son rôle PROPRE, puisque c'est sa propre
 * société —, membership ACCEPTÉE, principal `active`. Un invité qui n'est
 * pas entré, un membre `orders` ou `billing`, ou un principal suspendu sont
 * refusés. `standing.via` n'est jamais lu : être admin d'un principal
 * n'ouvre pas la carte commune d'un autre.
 */
export function canSetSitesMenuOf(standing: CompanyStanding | null): boolean {
  return (
    standing !== null &&
    standing.companyStatus === "active" &&
    standing.ownAccepted &&
    standing.own !== null &&
    INHERITING_PARENT_ROLES.includes(standing.own)
  );
}
