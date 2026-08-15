import type { ProductionBatchView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderReader } from "../../domain/ports/order.reader.js";
import { GetProductionBatchQuery } from "./get-production-batch.query.js";

/**
 * Sert le lot d'une journée, **et** le nombre de commandes sans date de service.
 *
 * Les deux ensemble, en une réponse : ce second chiffre est ce qui empêche une
 * commande sans date de disparaître silencieusement de la production. Le laisser
 * à un second appel, c'est accepter que l'écran s'en passe le jour où on le
 * simplifie.
 *
 * Les deux lectures partent **en parallèle** : elles ne se conditionnent pas.
 */
@QueryHandler(GetProductionBatchQuery)
export class GetProductionBatchHandler implements IQueryHandler<
  GetProductionBatchQuery,
  ProductionBatchView
> {
  constructor(private readonly orders: OrderReader) {}

  async execute(query: GetProductionBatchQuery): Promise<ProductionBatchView> {
    const [sheets, undatedCount] = await Promise.all([
      this.orders.listForProduction(query.date),
      this.orders.countUndatedForProduction(),
    ]);
    return { date: query.date, sheets, undatedCount };
  }
}
