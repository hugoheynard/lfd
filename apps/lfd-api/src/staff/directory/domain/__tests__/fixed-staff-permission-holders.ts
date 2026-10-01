import type { StaffPermission } from "@lfd/contracts";

import { StaffPermissionHolders, type StaffPermissionHolder } from "../staff-permission-holders.js";

/**
 * Double de {@link StaffPermissionHolders} : pour chaque permission, les
 * personnes qui la tiennent, écrites à la main. Une permission absente n'est
 * tenue par personne.
 */
export class FixedStaffPermissionHolders extends StaffPermissionHolders {
  /** Les permissions demandées, dans l'ordre. */
  readonly asked: StaffPermission[] = [];

  constructor(
    private readonly byPermission: ReadonlyMap<
      StaffPermission,
      readonly StaffPermissionHolder[]
    > = new Map(),
  ) {
    super();
  }

  holdersOf(permission: StaffPermission): Promise<readonly StaffPermissionHolder[]> {
    this.asked.push(permission);
    return Promise.resolve(this.byPermission.get(permission) ?? []);
  }
}
