import type { DayVersionView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PackingDayVersionReader } from "../../channels/packing/packing-day-version.reader.js";
import { ProductionDayVersionReader } from "../../domain/ports/production-day-version.reader.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { GetProductionDayVersionQuery } from "./get-production-day-version.query.js";

/**
 * **La journée du fournil a-t-elle bougé ?** — la question qu'un poste pose
 * toutes les 15 s au lieu de tout relire
 * (`documentation/caching-usage/plan-version-par-journee.md`, V2).
 *
 * Une opération. Le numéro avance par les déclencheurs de la base, quel que
 * soit l'écrivain (D1) : ce handler ne fait que le lire.
 *
 * ## Deux journaux depuis la bascule du colisage (K2, 2026-10-04)
 *
 * Le poste de colisage d'une journée `packing` écrit au colisage, dont le
 * journal est à part (D3). La version servie est la SOMME des deux plus grands
 * numéros : chacun ne fait que monter tant qu'aucun balayage ne passe, donc la
 * somme change dès que l'un change — et le contrat se compare par égalité
 * (`DayVersionView`), jamais par ordre. Une journée `legacy` n'a aucune trace
 * au colisage : sa version est celle d'avant.
 */
@QueryHandler(GetProductionDayVersionQuery)
export class GetProductionDayVersionHandler implements IQueryHandler<
  GetProductionDayVersionQuery,
  DayVersionView
> {
  constructor(
    private readonly versions: ProductionDayVersionReader,
    private readonly packing: PackingDayVersionReader,
  ) {}

  async execute(query: GetProductionDayVersionQuery): Promise<DayVersionView> {
    const day = ServiceDay.of(query.serviceDay);
    const [production, packing] = await Promise.all([
      this.versions.versionOf(day),
      this.packing.versionOf(day.value),
    ]);
    return { date: day.value, version: production + packing };
  }
}
