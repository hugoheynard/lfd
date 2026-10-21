import type { ProductionSettingsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { ProductionSettingsReader } from "../../domain/ports/production-settings.reader.js";
import { latestOrderCutoff } from "../../domain/services/latest-order-cutoff.js";
import { todayOf } from "../../domain/services/relative-day.js";
import { PlanStopRules } from "../services/plan-stop-rules.js";
import { GetProductionSettingsQuery } from "./get-production-settings.query.js";

/**
 * **La page Production › Réglages**, en une lecture.
 *
 * L'arrêt automatique n'est plus un réglage du fournil (2026-10-21,
 * `limites-de-commande/plan-une-seule-heure.md` §5) : il est servi EN
 * LECTURE, tel que l'heure limite générale le fixe, rattrapage compris — la
 * page dit où il se règle. Depuis le lot R3a du réassort (2026-10-21), c'est
 * la plus tardive de cette heure et de l'heure du réassort. Les jours fermés se lisent d'aujourd'hui, à
 * l'heure de la maison : un jour passé n'a plus rien à régler.
 */
@QueryHandler(GetProductionSettingsQuery)
export class GetProductionSettingsHandler implements IQueryHandler<
  GetProductionSettingsQuery,
  ProductionSettingsView
> {
  constructor(
    private readonly settings: ProductionSettingsReader,
    private readonly stopRules: PlanStopRules,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<ProductionSettingsView> {
    const [rules, closedDays] = await Promise.all([
      this.stopRules.rules(),
      this.settings.closedDaysFrom(todayOf(this.clock.now())),
    ]);
    const close = latestOrderCutoff(rules);
    return {
      automaticClose:
        close === null ? null : { daysBefore: close.daysBefore, time: close.time.value },
      closedDays,
    };
  }
}
