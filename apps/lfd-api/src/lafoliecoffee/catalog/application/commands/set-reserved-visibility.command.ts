import type { ReservedVisibility } from "@lfd/contracts";

/**
 * Règle ce que voient les pros non réservataires d'un article réservé :
 * `hidden` (absent) ou `visible_locked` (listé, non commandable) — plan
 * `documentation/catalogue/plan-articles-sur-mesure.md`, lot L1a.
 */
export class SetReservedVisibilityCommand {
  constructor(
    readonly sku: string,
    readonly visibility: ReservedVisibility,
  ) {}
}
