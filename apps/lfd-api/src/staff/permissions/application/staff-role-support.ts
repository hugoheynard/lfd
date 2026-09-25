import { isSuperAdminRoleKey } from "@lfd/contracts";

import type { StaffRoleDefinition } from "../domain/staff-role-definition.js";
import { ReservedStaffRoleKeyError, StaffRoleNotFoundError } from "../domain/staff-role-errors.js";
import type { StaffRoleLoadOptions, StaffRoleRepository } from "../domain/staff-role.repository.js";

/**
 * Le rôle, s'il est modifiable. Partagé par les trois mutations parce que les
 * deux refus sont les mêmes partout — et qu'un troisième handler qui oublierait
 * le premier rendrait `superadmin` archivable.
 *
 * `superadmin` est refusé **avant** la lecture : il n'a pas de ligne, donc un
 * simple `load` rendrait « rôle introuvable » — un message qui laisserait croire
 * à une faute de frappe alors que la réponse est « celui-là ne se modifie pas ».
 *
 * @throws {ReservedStaffRoleKeyError} c'est le sommet, il vit dans le code.
 * @throws {StaffRoleNotFoundError} aucune ligne pour cette clé.
 */
export async function loadEditableRole(
  roles: StaffRoleRepository,
  key: string,
  options?: StaffRoleLoadOptions,
): Promise<StaffRoleDefinition> {
  if (isSuperAdminRoleKey(key)) {
    throw new ReservedStaffRoleKeyError(key);
  }
  const role = await roles.load(key, options);
  if (role === null) {
    throw new StaffRoleNotFoundError(key);
  }
  return role;
}
