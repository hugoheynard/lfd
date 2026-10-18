import type { VitrineDeliveryView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { VitrineDeliveryReader } from "../../domain/ports/vitrine-delivery.reader.js";
import { ListVitrineDeliveriesQuery } from "./list-vitrine-deliveries.query.js";

/** Ce que l'écran montre : les cinquante derniers envois, assez pour lire une panne. */
export const VITRINE_JOURNAL_LIMIT = 50;

@QueryHandler(ListVitrineDeliveriesQuery)
export class ListVitrineDeliveriesHandler implements IQueryHandler<
  ListVitrineDeliveriesQuery,
  readonly VitrineDeliveryView[]
> {
  constructor(private readonly deliveries: VitrineDeliveryReader) {}

  execute(query: ListVitrineDeliveriesQuery): Promise<readonly VitrineDeliveryView[]> {
    return this.deliveries.listForSubscriber(query.subscriberId, VITRINE_JOURNAL_LIMIT);
  }
}
