import type { ProductionDayResupply, ProductionDayResuppliesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DayResuppliesReader } from "../../channels/commerce/day-resupplies.reader.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { GetDayResuppliesQuery } from "./get-day-resupplies.query.js";

/**
 * **Les réassorts d'une journée, au dossier du jour** (lot R3d,
 * `documentation/reassort-boutiques/plan-reapprovisionnement.md`).
 *
 * Arrêtée : la copie FIGÉE (`production_resupply`) — ce que le PDF imprime.
 * Ouverte : ce que le commerce a envoyé « pour demain » à ce jour, par le
 * port qui servira à figer (`DayResuppliesReader`) — l'écran le montre
 * distingué, pour que ce que compte le prévisionnel s'y retrouve.
 *
 * Une lecture : rien n'est écrit, pas même la journée ouverte que `load` rend.
 */
@QueryHandler(GetDayResuppliesQuery)
export class GetDayResuppliesHandler implements IQueryHandler<
  GetDayResuppliesQuery,
  ProductionDayResuppliesView
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly sent: DayResuppliesReader,
  ) {}

  async execute(query: GetDayResuppliesQuery): Promise<ProductionDayResuppliesView> {
    const serviceDay = ServiceDay.of(query.serviceDay);
    const day = await this.days.load(serviceDay);
    const frozen = day.isClosed;
    const resupplies: readonly ProductionDayResupply[] = frozen
      ? day.resupplies
      : await this.sent.placedFor(serviceDay);
    return {
      date: serviceDay.value,
      frozen,
      resupplies: resupplies.map((resupply) => ({
        resupplyId: resupply.resupplyId,
        siteId: resupply.siteId,
        siteLabel: resupply.siteLabel,
        name: resupply.name,
        servedByTransfer: resupply.servedByTransfer,
        lines: resupply.lines.map((line) => ({
          sku: line.sku,
          productName: line.productName,
          quantity: line.quantity,
        })),
      })),
    };
  }
}
