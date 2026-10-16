import {
  staffActionSchema,
  staffPermission,
  GRANTABLE_STAFF_RESOURCES,
  type RoleGrant,
  type StaffMeView,
  type StaffPermission,
  type StaffResource,
  type StaffRoleView,
  type StaffUserView,
} from '@lfd/contracts';

/**
 * **La garde des outils agent des droits** (plan
 * `documentation/droits-et-permissions/plan-outils-agent-droits.md`, A4 et
 * corrections après vitruve) — ce que l'agent ne touche pas, même quand la
 * personne connectée le peut.
 *
 * Chaque fonction rend la RAISON du refus, ou `null`. Elle est consultée avant
 * tout appel d'écriture ; un refus n'envoie rien au serveur.
 *
 * 🔴 Elle évite une **erreur** de l'agent ; elle n'arrête pas un agent
 * hostile, qui a la même session et peut appeler les routes lui-même. Le
 * serveur reste la porte.
 *
 * La garde porte sur le **pouvoir**, pas sur la clé : un rôle créé à l'écran
 * peut ouvrir la gestion des droits sous n'importe quel nom. Elle lit les
 * droits RÉSOLUS que le serveur sert (`StaffRoleView.permissions`,
 * `StaffUserView.permissions`) et ne les recombine jamais.
 */

/** La ressource qui ouvre la gestion des droits — hors de portée de l'agent. */
const ACCESS_RESOURCE: StaffResource = 'staff_access';

/** Les rôles que l'agent ne modifie, n'assigne ni ne retire (Hugo, 2026-10-15). */
const RESERVED_ROLE_KEYS: readonly string[] = ['superadmin', 'admin'];

const RETURN_TO_SCREEN = 'Ce geste se fait à l’écran Équipe → Rôles ou Équipe → Annuaire.';

/** Un droit du catalogue, avec sa ressource et son action. */
export interface ParsedPermission extends RoleGrant {
  readonly permission: StaffPermission;
}

/** Les droits du catalogue, décomposés une fois. */
// Sans les ressources retirées : l'agent ne les accorde jamais (plan-droit-lfc-catalog.md, L2).
const CATALOGUE: readonly ParsedPermission[] = GRANTABLE_STAFF_RESOURCES.flatMap((resource) =>
  staffActionSchema.options.map((action) => ({
    resource,
    action,
    permission: staffPermission(resource, action),
  })),
);

/** Le droit `ressource:action` donné à un outil, s'il existe au catalogue. */
export function parsePermission(raw: string): ParsedPermission | null {
  return CATALOGUE.find((entry) => entry.permission === raw.trim()) ?? null;
}

/** Ces droits résolus ouvrent-ils la gestion des droits ? */
export function opensAccessManagement(permissions: readonly StaffPermission[]): boolean {
  return permissions.some((permission) => permission.startsWith(`${ACCESS_RESOURCE}:`));
}

/** Refus d'un droit à accorder ou retirer : jamais `staff_access:*`. */
export function permissionRefusal(permission: StaffPermission): string | null {
  return permission.startsWith(`${ACCESS_RESOURCE}:`)
    ? `${permission} ouvre la gestion des droits : l’agent ne l’accorde ni ne le retire. ${RETURN_TO_SCREEN}`
    : null;
}

/**
 * Refus d'un rôle comme CIBLE — à modifier (`role_grant`, `role_revoke`) ou à
 * assigner (`staff_assign_role`). `ownRoleToo` : le rôle de la personne
 * connectée est refusé à la modification (on ne retire pas ses propres droits
 * par mégarde, on ne s'en donne pas) ; l'assigner à QUELQU'UN D'AUTRE ne
 * touche pas à soi.
 */
export function roleRefusal(
  role: StaffRoleView,
  me: StaffMeView | null,
  ownRoleToo: boolean,
): string | null {
  if (role.locked || RESERVED_ROLE_KEYS.includes(role.key)) {
    return `le rôle « ${role.label} » (${role.key}) est hors de portée de l’agent. ${RETURN_TO_SCREEN}`;
  }
  if (opensAccessManagement(role.permissions)) {
    return `le rôle « ${role.label} » (${role.key}) ouvre la gestion des droits (staff_access) : l’agent n’y touche pas. ${RETURN_TO_SCREEN}`;
  }
  if (!ownRoleToo) {
    return null;
  }
  if (me === null) {
    return 'la personne connectée n’est pas identifiée : impossible de vérifier qu’il ne s’agit pas de son propre rôle.';
  }
  return me.role === role.key
    ? `« ${role.label} » est votre propre rôle : l’agent ne le modifie pas. ${RETURN_TO_SCREEN}`
    : null;
}

/** Refus d'une PERSONNE dont l'agent changerait le rôle. */
export function personRefusal(person: StaffUserView, me: StaffMeView | null): string | null {
  const who = `${person.firstName} ${person.lastName}`.trim();
  if (person.isRescue) {
    return `${who} est la fiche de secours : son rôle ne se change pas.`;
  }
  if (RESERVED_ROLE_KEYS.includes(person.role)) {
    return `${who} tient le rôle « ${person.roleLabel} » (${person.role}), hors de portée de l’agent. ${RETURN_TO_SCREEN}`;
  }
  if (opensAccessManagement(person.permissions)) {
    return `${who} gère les droits (staff_access, par son rôle ou une dérogation) : l’agent ne change pas son rôle. ${RETURN_TO_SCREEN}`;
  }
  if (me === null) {
    return 'la personne connectée n’est pas identifiée : impossible de vérifier qu’il ne s’agit pas d’elle-même.';
  }
  return me.id === person.id
    ? `c’est vous : l’agent ne change pas votre propre rôle. ${RETURN_TO_SCREEN}`
    : null;
}
