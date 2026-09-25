import {
  roleGrantsSchema,
  staffRoleSchema,
  toRoleGrants,
  type RoleGrants,
  type StaffRole,
} from "@lfd/contracts";

import type { PrismaService } from "../../../platform/database/prisma.service.js";
import { keepsDirectory } from "../staff-access.policy.js";
import type { DirectoryKeeper } from "../domain/staff-role-definition.js";
import { StaffRoleNotAssignableError } from "../domain/staff-role-errors.js";
import { HELD_ROLE_SELECT, heldRoleGrants, heldRoleKey } from "./held-role.js";

/**
 * **Attribuer un rôle, et compter qui tient l'annuaire** — les deux lectures
 * de définitions que l'annuaire fait pour écrire une fiche (plan
 * `documentation/staff/plan-roles-lus-en-base.md` §3.3 et §3.5).
 *
 * Vivent dans `permissions/` parce que c'est la table des rôles qu'elles lisent ;
 * l'annuaire les appelle depuis son adaptateur.
 */

/** Le rôle qu'on s'apprête à écrire sur une fiche, lu sous verrou. */
export interface AssignableRole {
  readonly key: string;
  readonly label: string;
  readonly grants: RoleGrants;
}

interface DefinitionRow {
  readonly key: string;
  readonly label: string;
  readonly grants: unknown;
  readonly archived_at: Date | null;
}

/**
 * La définition **active** de `key`, relue sous verrou partagé (`FOR SHARE`).
 *
 * 🔴 Le verrou ne vaut que dans une transaction : l'appelant tourne dans
 * l'unité de travail de son handler, et le client la suit (`transactionalPrisma`).
 * Tenu jusqu'au commit, il fait attendre un archivage concurrent — qui prend
 * `FOR UPDATE` sur la même ligne — jusqu'à ce que la fiche soit écrite, et
 * l'archivage compte alors ce nouveau porteur. Dans l'autre ordre, c'est
 * l'attribution qui attend, et relit un rôle archivé.
 *
 * @throws {StaffRoleNotAssignableError} la clé n'est pas définie, ou archivée.
 */
export async function assignableRole(prisma: PrismaService, key: string): Promise<AssignableRole> {
  const [row] = await prisma.$queryRaw<readonly DefinitionRow[]>`
    SELECT "key", "label", "grants", "archived_at"
    FROM "public"."staff_role_definitions"
    WHERE "key" = ${key}
    FOR SHARE`;
  if (row === undefined || row.archived_at !== null) {
    throw new StaffRoleNotAssignableError(key, row !== undefined);
  }
  // Illisible = aucun droit : même lecture que le résolveur, qui le journalise.
  const parsed = roleGrantsSchema.safeParse(row.grants);
  return {
    key: row.key,
    label: row.label,
    grants: parsed.success ? toRoleGrants(parsed.data) : {},
  };
}

/**
 * Les colonnes de rôle d'une fiche : la clé, et l'enum le temps de la
 * transition — `NULL` pour un rôle hors enum (§3.5).
 *
 * `role` est TOUJOURS écrit, même nul : la colonne a un défaut (`commercial`),
 * et le déclencheur de synchronisation recopierait ce défaut dans `role_key`.
 */
export function roleColumns(key: string): {
  readonly roleKey: string;
  readonly role: StaffRole | null;
} {
  const builtIn = staffRoleSchema.safeParse(key);
  return { roleKey: key, role: builtIn.success ? builtIn.data : null };
}

/**
 * Les personnes non suspendues qui tiennent `staff_access:write` **par leur
 * rôle**, la fiche de secours exclue — elle résout `superadmin` quoi qu'il
 * arrive, et la compter rendrait l'invariant toujours vrai (§3.3).
 *
 * Tout l'annuaire est lu : il tient en une poignée de lignes, et le filtre
 * rejoue exactement la résolution du guard — un `where` SQL sur le `jsonb`
 * en serait une seconde implémentation.
 */
export async function directoryKeepers(
  prisma: PrismaService,
  rescueEmail: string,
): Promise<readonly DirectoryKeeper[]> {
  const rows = await prisma.staffUser.findMany({
    where: { status: { not: "suspended" }, email: { not: rescueEmail } },
    select: {
      id: true,
      ...HELD_ROLE_SELECT,
      overrides: { select: { resource: true, action: true, effect: true } },
    },
  });
  return rows
    .filter((row) =>
      // Une définition illisible n'accorde rien : elle ne fait pas un recours.
      // Le résolveur la journalise déjà à chaque résolution de ses porteurs.
      keepsDirectory(
        heldRoleGrants(row, () => undefined),
        row.overrides,
      ),
    )
    .map((row) => ({ staffUserId: row.id, roleKey: heldRoleKey(row) }));
}
