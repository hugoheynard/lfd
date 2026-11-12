import type { StaffPermission } from "@lfd/contracts";

/**
 * L'écran Catalogue du back-office, en une lecture
 * (`plan-catalogue-du-back-office.md`, § 3.1). Les permissions de l'appelant
 * décident si les marqueurs du sur mesure en sont.
 */
export class GetCatalogScreenQuery {
  constructor(readonly permissions: readonly StaffPermission[]) {}
}
