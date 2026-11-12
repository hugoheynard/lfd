import type { GlobalVersionSubject, StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { GlobalVersionSource } from "../../../platform/day-versions/global-version-source.js";
import { PimChangeVersionReader } from "../domain/ports/pim-change-version.reader.js";

/** La fenêtre de `pim` : 30 s. */
export const PIM_FRESH_MS = 30_000;

/**
 * **Le référentiel**, pour la porte des versions (`le-cache-du-back-office.md`,
 * § 5.2 et § 5.3) : le numéro du journal `pim.pim_change`.
 *
 * Ouvert à quiconque lit une part du référentiel — fiches, taux, contextes
 * de vente ou matrice des allergènes. Le numéro ne dit qu'« un changement a
 * eu lieu » ; chaque contenu reste servi sous la garde de sa propre route.
 */
@Injectable()
export class PimVersionSource extends GlobalVersionSource {
  readonly subject: GlobalVersionSubject = "pim";
  readonly readers: readonly [StaffPermission, ...StaffPermission[]] = [
    "pim_catalog:read",
    "pim_tax:read",
    "pim_settings:read",
    "allergen_matrix:read",
  ];
  readonly freshMs = PIM_FRESH_MS;

  constructor(private readonly versions: PimChangeVersionReader) {
    super();
  }

  versionOf(): Promise<number> {
    return this.versions.versionOf();
  }
}
