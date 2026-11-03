import type { DayJournal, StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { DayVersionSource } from "../../../platform/day-versions/day-version-source.js";
import { PackingDayVersionReader } from "../../channels/packing/packing-day-version.reader.js";
import { ProductionDayVersionReader } from "../../domain/ports/production-day-version.reader.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * **Le journal du fournil** pour la porte unique des versions de journée
 * (`plan-version-par-journee.md`, D8).
 *
 * ## Deux journaux depuis la bascule du colisage (K2, 2026-10-04)
 *
 * Le poste de colisage d'une journée `packing` écrit au colisage, dont le
 * journal est à part (D3). La version servie est la SOMME des deux plus grands
 * numéros : chacun ne fait que monter tant qu'aucun balayage ne passe, donc la
 * somme change dès que l'un change — et le contrat se compare par égalité,
 * jamais par ordre. Une journée `legacy` n'a aucune trace au colisage.
 *
 * Lisible sous l'un des quatre gestes du fournil et du retrait
 * (`plan-droits-par-geste.md`, DG-D1) OU sous `b2b_supervision:read` — les
 * droits de ses deux anciennes portes, relevés le 2026-11-03 dans
 * `production-day-version.controller.ts` et `production-supervision.controller.ts`.
 *
 * @throws {InvalidServiceDayError} la journée est mal formée — sans interroger les journaux.
 */
@Injectable()
export class ProductionDayVersionSource extends DayVersionSource {
  readonly journal: DayJournal = "production";
  readonly readers: readonly [StaffPermission, ...StaffPermission[]] = [
    "production_plan:read",
    "production_worksheet:read",
    "production_packing:read",
    "handover_counter:read",
    "b2b_supervision:read",
  ];

  constructor(
    private readonly versions: ProductionDayVersionReader,
    private readonly packing: PackingDayVersionReader,
  ) {
    super();
  }

  async versionOf(serviceDay: string): Promise<number> {
    const day = ServiceDay.of(serviceDay);
    const [production, packing] = await Promise.all([
      this.versions.versionOf(day),
      this.packing.versionOf(day.value),
    ]);
    return production + packing;
  }
}
