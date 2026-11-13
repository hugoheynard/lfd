import type { GlobalVersionSubject, StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { GlobalVersionSource } from "../../../../platform/day-versions/global-version-source.js";
import { CompanyChangeVersionReader } from "../../domain/ports/company-change-version.reader.js";

/** La fenêtre de `companies` : 30 s (`le-cache-du-back-office.md`, § 2.1). */
export const COMPANIES_FRESH_MS = 30_000;

/**
 * **Les comptes clients**, pour la porte des versions
 * (`le-cache-du-back-office.md`, § 2.2–2.3) : le numéro du journal
 * `public.company_change`. Sous `b2b_companies:read`, le droit de la liste
 * et de la fiche des sociétés, et sous `handover_counter:read` et
 * `b2b_supervision:read` : la file de retrait affiche le nom des sociétés et
 * se relit quand l'une change (décidé par Hugo le 2026-11-13). Un numéro ne
 * dit rien d'une société.
 */
@Injectable()
export class CompaniesVersionSource extends GlobalVersionSource {
  readonly subject: GlobalVersionSubject = "companies";
  readonly readers: readonly [StaffPermission, ...StaffPermission[]] = [
    "b2b_companies:read",
    "handover_counter:read",
    "b2b_supervision:read",
  ];
  readonly freshMs = COMPANIES_FRESH_MS;

  constructor(private readonly versions: CompanyChangeVersionReader) {
    super();
  }

  versionOf(): Promise<number> {
    return this.versions.versionOf();
  }
}
