import { staffPermission, type StaffPermission } from "@lfd/contracts";

import {
  type StaffAuthorDirectory,
  staffAuthorName,
} from "../../staff/directory/domain/staff-author-directory.js";
import type {
  StaffPermissionHolder,
  StaffPermissionHolders,
} from "../../staff/directory/domain/staff-permission-holders.js";
import type { CitedDriver } from "../domain/events/delivery-round.events.js";
import { DriverAccess } from "../domain/value-objects/driver-access.js";

/**
 * **Le premier des deux droits qui font un livreur** (plan « Ma tournée »,
 * MT-D2 v2) : conduire sa tournée. Un livreur proposable, affectable, le tient
 * EFFECTIVEMENT — jamais parce qu'il porte la clé `livreur`.
 */
export const DRIVING_PERMISSION: StaffPermission = staffPermission("delivery_driving", "write");

/**
 * **Le second** (audit 2026-10-07, B8) : les gestes à la porte (AP-D9).
 * `write`, parce que l'arrivée, la remise, le dépôt, le signalement, la
 * clôture et le retour sont tous des `POST` sous `delivery_doorstep`
 * (`my-delivery-doorstep.controller.ts`, vérifié le 2026-10-07).
 */
export const DOORSTEP_PERMISSION: StaffPermission = staffPermission("delivery_doorstep", "write");

/**
 * Qui tient quoi, maintenant : deux lectures de l'annuaire, l'une APRÈS
 * l'autre — dans l'affectation, elles passent par la transaction ouverte, sur
 * sa seule connexion (`transactional-prisma.ts`, vérifié le 2026-10-07).
 */
async function heldNow(holders: StaffPermissionHolders): Promise<{
  readonly driving: readonly StaffPermissionHolder[];
  readonly access: DriverAccess;
}> {
  const driving = await holders.holdersOf(DRIVING_PERMISSION);
  const doorstep = await holders.holdersOf(DOORSTEP_PERMISSION);
  return { driving, access: DriverAccess.of(idsOf(driving), idsOf(doorstep)) };
}

function idsOf(holders: readonly StaffPermissionHolder[]): readonly string[] {
  return holders.map((holder) => holder.staffUserId);
}

/** L'accès des livreurs, maintenant — ce que l'agrégat consulte pour affecter. */
export async function driverAccessNow(holders: StaffPermissionHolders): Promise<DriverAccess> {
  return (await heldNow(holders)).access;
}

/**
 * Les fiches qui peuvent livrer, maintenant, avec leur nom — celles que l'écran
 * Tournées propose : les deux droits, dans l'ordre de l'annuaire.
 */
export async function deliverersNow(
  holders: StaffPermissionHolders,
): Promise<readonly StaffPermissionHolder[]> {
  const { driving, access } = await heldNow(holders);
  return driving.filter((holder) => access.canDeliver(holder.staffUserId));
}

/**
 * Les fiches qui peuvent livrer, maintenant — le `canDrive` de la vue Tournées :
 * un livreur affecté qui a perdu l'un des deux droits y est « sans accès ».
 */
export async function driversNow(holders: StaffPermissionHolders): Promise<ReadonlySet<string>> {
  return new Set(idsOf(await deliverersNow(holders)));
}

/** Des fiches citées au journal : leur nom quand l'annuaire le connaît, leur id nu sinon. */
export async function citeDrivers(
  directory: StaffAuthorDirectory,
  staffUserIds: readonly string[],
): Promise<ReadonlyMap<string, CitedDriver>> {
  const names = await driverNamesOf(directory, staffUserIds);
  return new Map(
    staffUserIds.map((id) => {
      const name = names.get(id) ?? null;
      return [id, name === null ? id : { id, name }];
    }),
  );
}

/** Le nom des fiches, lu dans l'annuaire ; `null` : fiche inconnue ou sans nom. */
export async function driverNamesOf(
  directory: StaffAuthorDirectory,
  staffUserIds: readonly string[],
): Promise<ReadonlyMap<string, string | null>> {
  const authors = await directory.identify(staffUserIds);
  return new Map(
    staffUserIds.map((id) => {
      const author = authors.find(id);
      return [id, author === null ? null : staffAuthorName(author)];
    }),
  );
}
