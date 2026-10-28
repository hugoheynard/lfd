import type { ProductionDueThresholdsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DueThresholdsReader } from "../../channels/commerce/due-thresholds.reader.js";
import { ProductionTrancheSettings } from "../../domain/entities/production-tranche-settings.js";
import { ProductionTrancheSettingsReader } from "../../domain/ports/production-tranche-settings.reader.js";
import { rangeInTranches } from "../../domain/services/production-tranches.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { GetProductionDueThresholdsQuery } from "./get-production-due-thresholds.query.js";

/**
 * **Avant quelle heure sortir quoi**, pour une journée — l'aperçu en lecture
 * seule du lot V0 (plan production par vagues).
 *
 * Les besoins viennent du commerce : la règle (échéance moins marge, cumul,
 * seuil des commandes sans échéance) lui appartient, lui seul connaissant
 * l'échéance d'une commande et ses marges. Le RANGEMENT en tranches est à la
 * production (plan `fournil/plan-tranches-de-production.md`, §3) : le
 * réglage de l'atelier, fixe ou calculé, est lu ici et appliqué par
 * {@link rangeInTranches}. Il n'écrit rien.
 *
 * @throws {InvalidServiceDayError} la date n'est pas un jour ISO.
 */
@QueryHandler(GetProductionDueThresholdsQuery)
export class GetProductionDueThresholdsHandler implements IQueryHandler<
  GetProductionDueThresholdsQuery,
  ProductionDueThresholdsView
> {
  constructor(
    private readonly thresholds: DueThresholdsReader,
    private readonly tranches: ProductionTrancheSettingsReader,
  ) {}

  async execute(query: GetProductionDueThresholdsQuery): Promise<ProductionDueThresholdsView> {
    const day = ServiceDay.of(query.date);
    const [due, posed] = await Promise.all([
      this.thresholds.dueThresholdsFor(day),
      this.tranches.current(),
    ]);
    const settings = posed ?? ProductionTrancheSettings.defaults();
    const fixedTranches = settings.mode === "fixed" ? [...settings.fixedTranches] : [];
    return {
      date: day.value,
      deliveryMarginMinutes: due.deliveryMarginMinutes,
      pickupMarginMinutes: due.pickupMarginMinutes,
      trancheMode: settings.mode,
      fixedTranches,
      lines: rangeInTranches(due.items, settings.mode, fixedTranches).map((line) => ({
        ...line,
        thresholds: line.thresholds.map((threshold) => ({ ...threshold })),
      })),
    };
  }
}
