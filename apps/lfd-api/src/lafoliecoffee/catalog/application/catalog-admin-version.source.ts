import type { GlobalVersionSubject, StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { GlobalVersionSource } from "../../../platform/day-versions/global-version-source.js";
import { CatalogAdminChangeVersionReader } from "../domain/ports/catalog-admin-change-version.reader.js";

/** La fenêtre de `catalog-admin` : 15 s. */
export const CATALOG_ADMIN_FRESH_MS = 15_000;

/**
 * **L'écran Catalogue du back-office**, pour la porte des versions
 * (`plan-catalogue-du-back-office.md`, § 3.3) : le numéro du journal
 * `public.catalog_admin_change`. Sous `lfc_catalog:read`, le droit de l'écran.
 */
@Injectable()
export class CatalogAdminVersionSource extends GlobalVersionSource {
  readonly subject: GlobalVersionSubject = "catalog-admin";
  readonly readers: readonly [StaffPermission, ...StaffPermission[]] = ["lfc_catalog:read"];
  readonly freshMs = CATALOG_ADMIN_FRESH_MS;

  constructor(private readonly versions: CatalogAdminChangeVersionReader) {
    super();
  }

  versionOf(): Promise<number> {
    return this.versions.versionOf();
  }
}
