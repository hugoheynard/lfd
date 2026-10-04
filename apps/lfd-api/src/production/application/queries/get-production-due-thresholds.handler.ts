import type { ProductionDueThresholdsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DueThresholdsReader } from "../../channels/commerce/due-thresholds.reader.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { GetProductionDueThresholdsQuery } from "./get-production-due-thresholds.query.js";

/**
 * **Avant quelle heure sortir quoi**, pour une journée — l'aperçu en lecture
 * seule du lot V0 (plan production par vagues).
 *
 * Le handler ne calcule rien : la règle (échéance moins marge, cumul, seuil
 * des commandes sans échéance) appartient au commerce, qui seul connaît
 * l'échéance d'une commande et ses marges, et la sert par le port que la
 * production déclare. Ici, on traduit. Il n'écrit rien.
 *
 * @throws {InvalidServiceDayError} la date n'est pas un jour ISO.
 */
@QueryHandler(GetProductionDueThresholdsQuery)
export class GetProductionDueThresholdsHandler implements IQueryHandler<
  GetProductionDueThresholdsQuery,
  ProductionDueThresholdsView
> {
  constructor(private readonly thresholds: DueThresholdsReader) {}

  async execute(query: GetProductionDueThresholdsQuery): Promise<ProductionDueThresholdsView> {
    const day = ServiceDay.of(query.date);
    const due = await this.thresholds.dueThresholdsFor(day);
    return {
      date: day.value,
      deliveryMarginMinutes: due.deliveryMarginMinutes,
      pickupMarginMinutes: due.pickupMarginMinutes,
      lines: due.items.map((item) => ({
        sku: item.sku,
        productName: item.productName,
        total: item.total,
        thresholds: item.thresholds.map((threshold) => ({ ...threshold })),
      })),
    };
  }
}
