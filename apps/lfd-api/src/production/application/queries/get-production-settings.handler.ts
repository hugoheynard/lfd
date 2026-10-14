import type { ProductionSettingsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { OrderCutoffRulesReader } from "../../channels/commerce/order-cutoff-rules.reader.js";
import { OrderCutoffSwitchReader } from "../../channels/commerce/order-cutoff-switch.reader.js";
import { ProductionCloseSettings } from "../../domain/entities/production-close-settings.js";
import { ProductionSettingsReader } from "../../domain/ports/production-settings.reader.js";
import { latestOrderCutoff } from "../../domain/services/latest-order-cutoff.js";
import { todayOf } from "../../domain/services/relative-day.js";
import { GetProductionSettingsQuery } from "./get-production-settings.query.js";

/**
 * **La page Production › Réglages**, en une lecture.
 *
 * Personne n'a réglé : le réglage de départ, dit par l'agrégat (Q1) — une seule
 * source pour le défaut. L'heure limite la plus tardive est montrée parce
 * qu'elle borne l'heure d'arrêt automatique (Q5). Les jours fermés se lisent
 * d'aujourd'hui, à l'heure de la maison : un jour passé n'a plus rien à régler.
 *
 * L'interrupteur de l'heure limite générale est servi à côté (lot O3) :
 * désactivée, `latestOrderCutoff` est `null` sans que rien manque — l'arrêt du
 * plan est alors la limite, et la page le dit.
 */
@QueryHandler(GetProductionSettingsQuery)
export class GetProductionSettingsHandler implements IQueryHandler<
  GetProductionSettingsQuery,
  ProductionSettingsView
> {
  constructor(
    private readonly settings: ProductionSettingsReader,
    private readonly cutoffRules: OrderCutoffRulesReader,
    private readonly clock: Clock,
    private readonly cutoffSwitch: OrderCutoffSwitchReader,
  ) {}

  async execute(): Promise<ProductionSettingsView> {
    const [close, rules, closedDays, orderCutoffEnabled] = await Promise.all([
      this.settings.closeSettings(),
      this.cutoffRules.rules(),
      this.settings.closedDaysFrom(todayOf(this.clock.now())),
      this.cutoffSwitch.enabled(),
    ]);
    const cutoff = latestOrderCutoff(rules);
    return {
      close: close ?? ProductionCloseSettings.initial().values,
      latestOrderCutoff:
        cutoff === null ? null : { daysBefore: cutoff.daysBefore, time: cutoff.time.value },
      orderCutoffEnabled,
      closedDays,
    };
  }
}
