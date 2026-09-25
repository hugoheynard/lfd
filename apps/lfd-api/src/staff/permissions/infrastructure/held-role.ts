import {
  ALL_STAFF_PERMISSIONS,
  ROLE_GRANTS,
  STAFF_ROLE_LABELS,
  SUPER_ADMIN_ROLE_KEY,
  SUPER_ADMIN_ROLE_LABEL,
  resolvePermissionsFromGrants,
  roleGrantsSchema,
  toRoleGrants,
  type RoleGrants,
  type StaffOverride,
  type StaffPermission,
  type StaffRole,
} from "@lfd/contracts";

/**
 * **Le rôle qu'une fiche porte, lu en base** — et ce qu'il accorde.
 *
 * Plan `documentation/staff/plan-roles-lus-en-base.md` §3.2. Un seul endroit
 * sait passer d'une ligne `staff_users` (et de sa définition jointe) à des
 * droits : le résolveur d'accès, `/admin/me` et la liste de l'annuaire le
 * lisent tous trois. Deux implémentations de la même règle divergeraient, et
 * l'écran afficherait des droits que le guard n'applique pas.
 *
 * Infrastructure et non domaine : il relit un `jsonb` avec le schéma Zod du
 * contrat.
 */

/** Ce qu'une lecture de fiche doit sélectionner pour résoudre son rôle. */
export const HELD_ROLE_SELECT = {
  role: true,
  roleKey: true,
  roleDefinition: { select: { label: true, grants: true, archivedAt: true } },
} as const;

/** La forme lue — un sous-ensemble de la ligne, sans type Prisma. */
export interface HeldRoleRow {
  readonly role: StaffRole | null;
  readonly roleKey: string | null;
  readonly roleDefinition: {
    readonly label: string;
    readonly grants: unknown;
    readonly archivedAt: Date | null;
  } | null;
}

/** Le rôle résolu : sa clé, son libellé, et l'effectif qu'il donne avec les écarts. */
export interface ResolvedRole {
  readonly key: string;
  readonly label: string;
  readonly permissions: readonly StaffPermission[];
}

/** Où part une définition illisible : le log applicatif, avec la clé. */
export type UnreadableGrantsReporter = (roleKey: string, error: unknown) => void;

/** La clé portée. `role_key` d'abord ; l'enum n'est qu'un repli de transition. */
export function heldRoleKey(row: HeldRoleRow): string | null {
  return row.roleKey ?? row.role;
}

/** Le libellé : celui de la définition, sinon celui du contrat, sinon la clé. */
export function heldRoleLabel(row: HeldRoleRow): string {
  if (row.roleDefinition !== null) {
    return row.roleDefinition.label;
  }
  return row.role === null ? (row.roleKey ?? "") : STAFF_ROLE_LABELS[row.role];
}

/**
 * Les droits que le rôle accorde — le tableau du §3.2, ligne par ligne.
 *
 * - définition active et lisible → ses `grants` ;
 * - définition archivée → **aucun** droit par le rôle ;
 * - `grants` illisibles → **aucun** droit par le rôle, et l'erreur est
 *   rapportée avec la clé : une ligne corrompue ne fait tomber que ce rôle ;
 * - `role_key` nul → `ROLE_GRANTS[role]`, repli de transition retiré au
 *   « resserrer » (§4) ;
 * - ni l'un ni l'autre → rien.
 */
export function heldRoleGrants(row: HeldRoleRow, report: UnreadableGrantsReporter): RoleGrants {
  if (row.roleKey === null) {
    return row.role === null ? {} : ROLE_GRANTS[row.role];
  }
  const definition = row.roleDefinition;
  if (definition === null || definition.archivedAt !== null) {
    return {};
  }
  const parsed = roleGrantsSchema.safeParse(definition.grants);
  if (!parsed.success) {
    report(row.roleKey, parsed.error);
    return {};
  }
  return toRoleGrants(parsed.data);
}

/**
 * Le rôle et l'effectif d'une fiche.
 *
 * `isRescue` : c'est la fiche racine (§3.4). Elle résout **toujours**
 * `superadmin` — quels que soient son rôle, la table et ses écarts. C'est à
 * l'appelant d'établir que la fiche est bien celle-là, par la ligne trouvée,
 * jamais par l'adresse d'un jeton.
 */
export function resolveHeldRole(
  row: HeldRoleRow,
  overrides: readonly StaffOverride[],
  isRescue: boolean,
  report: UnreadableGrantsReporter,
): ResolvedRole {
  if (isRescue) {
    return {
      key: SUPER_ADMIN_ROLE_KEY,
      label: SUPER_ADMIN_ROLE_LABEL,
      permissions: ALL_STAFF_PERMISSIONS,
    };
  }
  return {
    key: heldRoleKey(row) ?? "",
    label: heldRoleLabel(row),
    permissions: resolvePermissionsFromGrants(heldRoleGrants(row, report), overrides),
  };
}
