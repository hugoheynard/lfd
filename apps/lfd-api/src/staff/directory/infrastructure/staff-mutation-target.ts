import type { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  heldRoleGrants,
  heldRoleKey,
  heldRoleLabel,
  isRescueFiche,
  type UnreadableGrantsReporter,
} from "../../permissions/infrastructure/held-role.js";
import { directoryKeepers } from "../../permissions/infrastructure/role-assignment.js";
import { keepsDirectory } from "../../permissions/staff-access.policy.js";
import { StaffUserNotFoundError } from "../domain/staff-user-errors.js";
import { SNAPSHOT, type LoadedTarget } from "./staff-user.rows.js";

/** Qui vise quoi, et comment reconnaître la fiche de secours. */
export interface MutationTargetQuery {
  readonly id: string;
  readonly actorId: string;
  readonly rescueEmail: string;
  readonly report: UnreadableGrantsReporter;
}

/**
 * Rassemble l'état complet d'avant — la fiche et ses dérogations — et les
 * faits dont la politique a besoin.
 *
 * `isSelf` compare les **id de fiche** : l'auteur arrive par son id
 * d'annuaire (`@StaffUserId()`), plus par son `sub`. Une fiche jamais liée
 * à une identité se reconnaît donc elle aussi — le garde-fou n'est plus
 * inerte tant que personne n'est entré.
 *
 * `keepsDirectory` et `otherDirectoryKeepers` se lisent sur le DROIT
 * (`staff_access:write` résolu depuis la définition), plus sur la chaîne
 * `"admin"` (plan `plan-roles-lus-en-base.md` §3.3). La fiche de secours n'en
 * est jamais : elle résout `superadmin` quoi qu'il arrive.
 *
 * @throws {StaffUserNotFoundError} l'`id` n'existe pas.
 */
export async function loadMutationTarget(
  prisma: PrismaService,
  query: MutationTargetQuery,
): Promise<LoadedTarget> {
  const existing = await prisma.staffUser.findUnique({
    where: { id: query.id },
    select: {
      ...SNAPSHOT,
      overrides: { select: { resource: true, action: true, effect: true } },
    },
  });
  if (existing === null) {
    throw new StaffUserNotFoundError(query.id);
  }
  const isRoot = isRescueFiche(existing.email, query.rescueEmail);
  const roleKey = heldRoleKey(existing);
  const keepers = await directoryKeepers(prisma, query.rescueEmail);
  return {
    snapshot: {
      id: existing.id,
      firstName: existing.firstName,
      lastName: existing.lastName,
      email: existing.email,
      phone: existing.phone,
      jobTitle: existing.jobTitle,
      role: roleKey ?? "",
      status: existing.status,
      auth0Id: existing.auth0Id,
    },
    overrides: existing.overrides,
    roleLabel: heldRoleLabel(existing),
    policy: {
      email: existing.email,
      isRoot,
      roleKey,
      currentOverrides: existing.overrides,
      keepsDirectory:
        !isRoot &&
        existing.status !== "suspended" &&
        keepsDirectory(heldRoleGrants(existing, query.report), existing.overrides),
      otherDirectoryKeepers: keepers.filter((keeper) => keeper.staffUserId !== query.id).length,
      isSelf: existing.id === query.actorId,
    },
  };
}
