import { z } from "zod";

import {
  ALL_STAFF_PERMISSIONS,
  ROLE_GRANTS,
  STAFF_ROLE_LABELS,
  resolvePermissionsFromGrants,
  staffActionSchema,
  staffResourceSchema,
  staffRoleSchema,
  type RoleGrants,
  type StaffOverride,
  type StaffPermission,
  type StaffResource,
  type StaffRole,
} from "./staff-access.js";

/**
 * **Les rôles deviennent de la donnée** — un seul reste dans le code.
 *
 * `staff-access.ts` posait la doctrine inverse : « le catalogue vit ici, dans le
 * code : typé, testé, diffable en revue ». Elle tenait tant que cinq rôles
 * suffisaient. Le terrain en demande de plus fins, et une découpe qui concerne
 * trois personnes n'est pas trois dérogations — c'est un rôle, et le dire par
 * des écarts finit par rendre l'effectif illisible.
 *
 * Ce qui remplace la garantie perdue est **un sommet, un seul, et hors de
 * portée de l'écran** : `superadmin`. Les cinq rôles historiques deviennent des
 * lignes semées, modifiables comme les autres.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Le sommet
// ─────────────────────────────────────────────────────────────────────────────

/** La clé du seul rôle qui reste dans le code. */
export const SUPER_ADMIN_ROLE_KEY = "superadmin";
export const SUPER_ADMIN_ROLE_LABEL = "Super administrateur";

export function isSuperAdminRoleKey(key: string): boolean {
  return key === SUPER_ADMIN_ROLE_KEY;
}

/**
 * Ce que `superadmin` accorde : **tout**, par court-circuit.
 *
 * Deux propriétés que la version « matrice remplie à la main » n'aurait pas, et
 * ce sont les deux raisons du court-circuit :
 *
 * - **une ressource ajoutée demain est couverte le jour même.** Une matrice
 *   énumérée aurait un trou jusqu'à ce que quelqu'un pense à la compléter — et
 *   le trou serait sur le compte censé pouvoir tout réparer ;
 * - **les dérogations ne s'appliquent pas.** C'est l'issue de secours du
 *   système : si un écart pouvait la refermer, quelqu'un qui tient `staff:write`
 *   pourrait retirer `staff:write` au sommet et verrouiller tout le monde
 *   dehors. Le paramètre est accepté et **délibérément ignoré** — la signature
 *   reste celle des autres rôles pour que l'appelant n'ait pas à distinguer.
 */
export function resolveRolePermissions(
  roleKey: string,
  grants: RoleGrants,
  overrides: readonly StaffOverride[] = [],
): readonly StaffPermission[] {
  if (isSuperAdminRoleKey(roleKey)) {
    return ALL_STAFF_PERMISSIONS;
  }
  return resolvePermissionsFromGrants(grants, overrides);
}

// ─────────────────────────────────────────────────────────────────────────────
// La clé
// ─────────────────────────────────────────────────────────────────────────────

export const STAFF_ROLE_KEY_MIN_LENGTH = 2;
export const STAFF_ROLE_KEY_MAX_LENGTH = 40;
export const STAFF_ROLE_LABEL_MAX_LENGTH = 60;

/**
 * La clé d'un rôle : ce qui s'écrit sur la fiche des personnes.
 *
 * Un slug, pas un libellé. Il vit dans une colonne, il apparaîtra dans le
 * journal d'activité, et il **ne se renomme pas** — le libellé, lui, change
 * librement. Même séparation que le `code` d'une appellation et son nom.
 */
export const staffRoleKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(STAFF_ROLE_KEY_MIN_LENGTH)
  .max(STAFF_ROLE_KEY_MAX_LENGTH)
  .regex(/^[a-z][a-z0-9-]*$/u, "minuscules, chiffres et tirets, commençant par une lettre");

// ─────────────────────────────────────────────────────────────────────────────
// Les droits
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un droit : une ressource, et le niveau le plus haut accordé dessus.
 *
 * **Un niveau, pas un ensemble.** Stocker `["read", "write"]` rendrait
 * exprimable un `write` sans `read` — modifier une page qu'on n'a pas le droit
 * d'ouvrir. Ici la forme l'interdit sans contrôle à écrire : `write` implique
 * `read` à la résolution.
 */
export const roleGrantSchema = z.object({
  resource: staffResourceSchema,
  action: staffActionSchema,
});
export type RoleGrant = z.infer<typeof roleGrantSchema>;

/**
 * Les droits d'un rôle. Une ressource n'y figure **qu'une fois** : deux lignes
 * sur la même ressource seraient une question sans réponse, et le dernier
 * arrivé gagnerait en silence.
 */
export const roleGrantsSchema = z
  .array(roleGrantSchema)
  .refine((grants) => new Set(grants.map((grant) => grant.resource)).size === grants.length, {
    message: "une ressource ne peut porter qu'un seul niveau",
  });

/** Passe de la forme transportée à la forme que la résolution consomme. */
export function toRoleGrants(grants: readonly RoleGrant[]): RoleGrants {
  const record: Partial<Record<StaffResource, RoleGrant["action"]>> = {};
  for (const grant of grants) {
    record[grant.resource] = grant.action;
  }
  return record;
}

/** L'inverse, dans l'ordre stable du catalogue de ressources. */
export function fromRoleGrants(grants: RoleGrants): readonly RoleGrant[] {
  return staffResourceSchema.options.flatMap((resource) => {
    const action = grants[resource];
    return action === undefined ? [] : [{ resource, action }];
  });
}

/**
 * Les cinq rôles historiques, tels qu'ils doivent être **semés** en base.
 *
 * `ROLE_GRANTS` cesse d'être l'autorité et devient une graine : après la
 * migration, ces lignes s'éditent comme n'importe quel autre rôle, et le
 * tableau du code n'est plus lu. Il reste là le temps de la bascule, puis s'en
 * va — le supprimer avant aurait fait perdre les justifications qu'il porte,
 * qui sont ce que quelqu'un relira en modifiant une de ces lignes.
 */
export function legacyRoleSeeds(): readonly {
  readonly key: StaffRole;
  readonly label: string;
  readonly grants: readonly RoleGrant[];
}[] {
  return staffRoleSchema.options.map((role) => ({
    key: role,
    label: STAFF_ROLE_LABELS[role],
    grants: fromRoleGrants(ROLE_GRANTS[role]),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Ce qui entre
// ─────────────────────────────────────────────────────────────────────────────

export const createStaffRolePayloadSchema = z.object({
  key: staffRoleKeySchema,
  label: z.string().trim().min(1).max(STAFF_ROLE_LABEL_MAX_LENGTH),
  grants: roleGrantsSchema,
});
export type CreateStaffRolePayload = z.infer<typeof createStaffRolePayloadSchema>;

/** La clé n'est pas modifiable : elle est écrite sur des fiches et dans le journal. */
export const updateStaffRolePayloadSchema = createStaffRolePayloadSchema.omit({ key: true });
export type UpdateStaffRolePayload = z.infer<typeof updateStaffRolePayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Ce qui sort
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un rôle tel que l'écran le montre.
 *
 * `permissions` est résolu **côté serveur** plutôt que recalculé à l'écran :
 * c'est la liste que le guard vérifiera, donc la seule qui réponde vraiment à
 * « qu'est-ce que cette personne pourra faire ». Un écran qui la recalcule
 * répond à une autre question, et les deux réponses finissent par diverger.
 */
export interface StaffRoleView {
  readonly key: string;
  readonly label: string;
  /** Vrai pour `superadmin` seul : ni éditable, ni archivable, ni assignable ici. */
  readonly locked: boolean;
  readonly grants: readonly RoleGrant[];
  readonly permissions: readonly StaffPermission[];
  /** Combien de personnes le portent — un rôle qui sert ne s'archive pas à l'aveugle. */
  readonly memberCount: number;
  readonly archivedAt: string | null;
}
