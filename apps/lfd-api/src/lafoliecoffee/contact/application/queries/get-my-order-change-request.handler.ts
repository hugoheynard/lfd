import type { OrderChangeRequestStatusResponse } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ChangedOrderNotFoundError } from "../../domain/errors/order-change-errors.js";
import { OrderChangeRequestReader } from "../../domain/ports/order-change-request.reader.js";
import { ReportableOrderReader } from "../../domain/ports/reportable-order.reader.js";
import { GetMyOrderChangeRequestQuery } from "./get-my-order-change-request.query.js";

/**
 * Sert au client l'état de sa dernière demande de modification — « en
 * attente », puis la réponse. Le mur d'abord, par LA règle d'accès d'une
 * commande (celle du signalement) : une commande hors de l'espace du client
 * ne dit même pas si on en a demandé la modification.
 */
@QueryHandler(GetMyOrderChangeRequestQuery)
export class GetMyOrderChangeRequestHandler implements IQueryHandler<
  GetMyOrderChangeRequestQuery,
  OrderChangeRequestStatusResponse
> {
  constructor(
    private readonly orders: ReportableOrderReader,
    private readonly requests: OrderChangeRequestReader,
  ) {}

  async execute(query: GetMyOrderChangeRequestQuery): Promise<OrderChangeRequestStatusResponse> {
    const order = await this.orders.visibleTo(query.orderId, query.actorUserId);
    if (order === null) {
      throw new ChangedOrderNotFoundError(query.orderId);
    }
    return { request: await this.requests.latestFor(order.id) };
  }
}
