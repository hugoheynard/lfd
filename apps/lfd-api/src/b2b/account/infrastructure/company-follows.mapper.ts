import type { CompanyFollowAspect } from "@lfd/contracts";

import { FollowPeriod } from "../domain/value-objects/follow-period.js";

/** Une ligne de `company_follows`, telle que les deux adaptateurs la lisent. */
export interface CompanyFollowRow {
  readonly parentId: string;
  readonly aspect: CompanyFollowAspect;
  readonly validFrom: Date;
  readonly validTo: Date | null;
}

/** Les colonnes lues — partagées par le lecteur à date et le dépôt. */
export const FOLLOW_SELECT = {
  parentId: true,
  aspect: true,
  validFrom: true,
  validTo: true,
} as const;

/** Ligne → période. */
export function periodOf(row: CompanyFollowRow): FollowPeriod {
  return FollowPeriod.reconstitute(row);
}
