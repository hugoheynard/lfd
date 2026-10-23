import type { OrderRevisability } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  customerRevisabilityOf,
  OrderRevisabilityReading,
} from "../services/order-revisability-reading.js";
import { RevisionWall } from "../services/revision-wall.js";
import { GetOrderRevisabilityQuery } from "./get-order-revisability.query.js";

/** Ce que la vue client ajoute à la commande : si elle se modifie, et sa révision. */
export interface CustomerRevisionStanding {
  readonly revisability: OrderRevisability;
  readonly revision: number;
}

/**
 * Sert la **modificabilité côté client** — la règle du geste, dans son ordre :
 * la frontière commune (annulée, prête, inscrite, engagée, carte), l'arrêt du
 * plan, puis l'heure limite de la date actuelle. Le mur est celui de la
 * modification (`RevisionWall`), donc celui de `GET /orders/:id`.
 */
@QueryHandler(GetOrderRevisabilityQuery)
export class GetOrderRevisabilityHandler implements IQueryHandler<
  GetOrderRevisabilityQuery,
  CustomerRevisionStanding
> {
  constructor(
    private readonly wall: RevisionWall,
    private readonly reading: OrderRevisabilityReading,
  ) {}

  async execute(query: GetOrderRevisabilityQuery): Promise<CustomerRevisionStanding> {
    const order = await this.wall.find(query.orderId, {
      kind: "customer",
      userId: query.actorUserId,
    });
    const verdict = await this.reading.verdictOf(order, "customer");
    return { revisability: customerRevisabilityOf(verdict), revision: order.revision };
  }
}
