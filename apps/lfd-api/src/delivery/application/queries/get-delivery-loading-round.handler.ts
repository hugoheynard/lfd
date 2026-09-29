import type { DeliveryLoadingRoundView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryRoundNotFoundError } from "../../domain/errors/delivery-round-errors.js";
import { DeliveryLoadingReader } from "../../domain/ports/delivery-loading.reader.js";
import { binContextOf } from "../bin-context.js";
import { loadingRoundView } from "../delivery-loading-view.js";
import { GetDeliveryLoadingRoundQuery } from "./get-delivery-loading-round.query.js";

/**
 * **Le chargement d'une tournée** (L4-C2) : chaque arrêt vivant, ses bacs, et
 * son état — non étiqueté, partiel, chargé (L4-C17). Une lecture.
 *
 * @throws {DeliveryRoundNotFoundError}
 */
@QueryHandler(GetDeliveryLoadingRoundQuery)
export class GetDeliveryLoadingRoundHandler implements IQueryHandler<
  GetDeliveryLoadingRoundQuery,
  DeliveryLoadingRoundView
> {
  constructor(
    private readonly loading: DeliveryLoadingReader,
    private readonly orders: DeliveryOrdersReader,
  ) {}

  async execute(query: GetDeliveryLoadingRoundQuery): Promise<DeliveryLoadingRoundView> {
    const round = await this.loading.round(query.roundId);
    if (round === null) {
      throw new DeliveryRoundNotFoundError(query.roundId);
    }
    const context = await binContextOf(
      this.loading,
      this.orders,
      round.stops.flatMap((stop) => stop.bins),
      round.stops.map((stop) => stop.orderId),
    );
    return loadingRoundView(round, context);
  }
}
