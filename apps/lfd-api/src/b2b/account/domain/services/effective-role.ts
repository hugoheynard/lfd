import type { CompanyRole } from "../value-objects/company-role.js";

/**
 * Les rôles du principal qui ouvrent ses sous-comptes (sous-comptes §3).
 * `orders` et `billing` du principal ne donnent rien sur un sous-compte : ils
 * n'administrent pas le principal lui-même.
 */
export const INHERITING_PARENT_ROLES: readonly CompanyRole[] = ["owner", "admin"];

const INHERITING_ROLES: ReadonlySet<CompanyRole> = new Set<CompanyRole>(INHERITING_PARENT_ROLES);

/**
 * Le plafond d'un rôle hérité : un `owner` du principal est `admin` dans le
 * sous-compte, et les gestes réservés au détenteur (transfert, second
 * détenteur) lui restent fermés.
 */
const INHERITED_CEILING: CompanyRole = "admin";

/**
 * **Le rôle effectif d'une personne dans une société X** — LA règle du §3,
 * écrite une fois.
 *
 * ```
 * rôle effectif dans X = max(rôle de membership(X),
 *                          min(rôle dans P, admin) si X.parent = P et ce rôle ∈ {owner, admin})
 *
 * Le MAX (Hugo, 2026-10-05) : un owner du principal qui a aussi `orders` dans
 * le sous-compte y reste admin — sa membership propre ne le rétrograde pas.
 * ```
 *
 * Jamais dans l'autre sens : une membership dans un sous-compte ne donne rien
 * sur le principal ni sur ses frères — l'appelant ne passe `roleInParent` que
 * pour le principal de X, et rien pour ses enfants.
 *
 * 🔴 Branchée sur UNE voie seulement (lot C1 de
 * `documentation/comptes-client/plan-commandes-des-sites.md`, §7.1, 2026-10-21) :
 * les gestes sur une commande EXISTANTE d'un site (`OrderAccessReader`, le mur
 * d'annulation, la liste agrégée). Ni `resolveCompany` (l'espace de travail),
 * ni `MembershipReader.roleOf`, ni `OrderGuardReader.roleOf` (passation, devis)
 * ne la lisent — vérifié le 2026-10-21 —, et commander pour un site reste hors
 * périmètre (R8). Les appelants ne passent `roleInParent` que d'une
 * membership du principal ACCEPTÉE, principal `active` (§7.2) : la condition
 * n'est pas ici, elle est dans la requête de l'adaptateur.
 *
 * @param ownRole la membership de la personne dans X, ou `null`.
 * @param roleInParent sa membership dans le principal de X, ou `null` si X
 *   n'a pas de principal ou qu'elle n'y est pas membre.
 */
export function effectiveRole(
  ownRole: CompanyRole | null,
  roleInParent: CompanyRole | null,
): CompanyRole | null {
  const inherited =
    roleInParent !== null && INHERITING_ROLES.has(roleInParent) ? INHERITED_CEILING : null;
  if (ownRole === null || inherited === null) {
    return ownRole ?? inherited;
  }
  return RANK[ownRole] >= RANK[inherited] ? ownRole : inherited;
}

/** Du plus large au plus étroit : `owner` > `admin` > `orders` = `billing`. */
const RANK: Readonly<Record<CompanyRole, number>> = { owner: 3, admin: 2, orders: 1, billing: 1 };
