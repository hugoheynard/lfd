import type { RoleGrants, StaffAction, StaffOverrideEffect } from "@lfd/contracts";

import type { CatalogRightResource } from "./catalog-right-resources.js";

/** Un rôle et ses droits relus ; `grants: null` quand ils ne se relisent pas. */
export interface CatalogRightRole {
  readonly key: string;
  readonly label: string;
  readonly archived: boolean;
  readonly grants: RoleGrants | null;
}

/** Une ligne de dérogation sur l'un des deux droits du catalogue. */
export interface CatalogRightOverride {
  readonly staffUserId: string;
  readonly staffName: string;
  readonly resource: CatalogRightResource;
  readonly action: StaffAction;
  readonly effect: StaffOverrideEffect;
}

/**
 * Port de **lecture** de l'aperçu du transfert du droit du catalogue
 * (`plan-droit-lfc-catalog.md`, C2). Ne sert que lui : ni le dépôt des rôles,
 * ni l'annuaire n'ont à porter ces trois lectures (ISP).
 */
export abstract class CatalogRightTransferReader {
  /** Tous les rôles définis en base, archivés compris. `superadmin` n'en a pas. */
  abstract roles(): Promise<readonly CatalogRightRole[]>;

  /** Les dérogations portant sur `b2b_catalog` ou `lfc_catalog`. */
  abstract catalogOverrides(): Promise<readonly CatalogRightOverride[]>;

  /** Les notifications d'audience `b2b_catalog:*` encore non lues. */
  abstract unreadLegacyNotifications(): Promise<number>;
}
