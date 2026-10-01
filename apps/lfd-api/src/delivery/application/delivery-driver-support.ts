import { staffPermission, type StaffPermission } from "@lfd/contracts";

import {
  type StaffAuthorDirectory,
  staffAuthorName,
} from "../../staff/directory/domain/staff-author-directory.js";
import type { StaffPermissionHolders } from "../../staff/directory/domain/staff-permission-holders.js";
import type { CitedDriver } from "../domain/events/delivery-round.events.js";

/**
 * **Le droit qui fait un livreur** (plan « Ma tournée », MT-D2 v2) : conduire
 * sa tournée. Un livreur proposable, affectable, est une personne qui le tient
 * EFFECTIVEMENT — jamais une personne qui porte la clé `livreur`.
 */
export const DRIVING_PERMISSION: StaffPermission = staffPermission("delivery_driving", "write");

/** Les fiches qui peuvent conduire, maintenant — lues par l'annuaire. */
export async function driversNow(holders: StaffPermissionHolders): Promise<ReadonlySet<string>> {
  const found = await holders.holdersOf(DRIVING_PERMISSION);
  return new Set(found.map((holder) => holder.staffUserId));
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
