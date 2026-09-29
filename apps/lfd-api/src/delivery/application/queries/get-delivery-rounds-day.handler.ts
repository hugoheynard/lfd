import type { DeliveryRoundsDayView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryRoundsReader } from "../../domain/ports/delivery-rounds.reader.js";
import { deliveryRoundsDayView } from "../delivery-rounds-view.js";
import { GetDeliveryRoundsDayQuery } from "./get-delivery-rounds-day.query.js";

/**
 * La composition d'un jour : les tournées, leurs arrêts signalés, et ce qui
 * reste à répartir. Une lecture : elle n'écrit rien.
 */
@QueryHandler(GetDeliveryRoundsDayQuery)
export class GetDeliveryRoundsDayHandler implements IQueryHandler<
  GetDeliveryRoundsDayQuery,
  DeliveryRoundsDayView
> {
  constructor(
    private readonly rounds: DeliveryRoundsReader,
    private readonly orders: DeliveryOrdersReader,
  ) {}

  async execute(query: GetDeliveryRoundsDayQuery): Promise<DeliveryRoundsDayView> {
    const [rounds, expected] = await Promise.all([
      this.rounds.roundsOn(query.day),
      this.orders.expectedOn(query.day),
    ]);
    const composedIds = rounds.flatMap((round) => round.stops.map((stop) => stop.orderId));
    const [composed, assigned] = await Promise.all([
      this.orders.byIds(composedIds),
      this.rounds.composedAmong(expected.map((order) => order.orderId)),
    ]);
    return deliveryRoundsDayView({
      day: query.day,
      rounds,
      expected,
      composed: new Map(composed.map((order) => [order.orderId, order])),
      assigned,
    });
  }
}
