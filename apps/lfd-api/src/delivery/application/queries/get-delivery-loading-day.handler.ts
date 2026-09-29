import type { DeliveryLoadingDayView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeliveryLoadingReader } from "../../domain/ports/delivery-loading.reader.js";
import { loadingDayView, ordersCitedBy } from "../delivery-loading-view.js";
import { GetDeliveryLoadingDayQuery } from "./get-delivery-loading-day.query.js";

/**
 * Les tournées d'un jour vues du dépôt — de quoi choisir le véhicule à
 * charger, sous le seul droit du chargement. Une lecture.
 */
@QueryHandler(GetDeliveryLoadingDayQuery)
export class GetDeliveryLoadingDayHandler implements IQueryHandler<
  GetDeliveryLoadingDayQuery,
  DeliveryLoadingDayView
> {
  constructor(private readonly loading: DeliveryLoadingReader) {}

  async execute(query: GetDeliveryLoadingDayQuery): Promise<DeliveryLoadingDayView> {
    const rounds = await this.loading.roundsOn(query.day);
    const bins = rounds.flatMap((round) => round.stops.flatMap((stop) => stop.bins));
    return loadingDayView(query.day, rounds, await this.loading.placesOf(ordersCitedBy(bins)));
  }
}
