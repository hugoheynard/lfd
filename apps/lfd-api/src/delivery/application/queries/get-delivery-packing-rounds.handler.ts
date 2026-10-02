import type { DeliveryPackingRoundsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeliveryOrdersReader, DeliveryOrderStatesReader } from "../../channels/commerce/index.js";
import { DeliveryLoadingReader } from "../../domain/ports/delivery-loading.reader.js";
import { namesByOrder, ordersCitedBy } from "../delivery-loading-view.js";
import { packingRoundsView } from "../delivery-packing-rounds-view.js";
import { GetDeliveryPackingRoundsQuery } from "./get-delivery-packing-rounds.query.js";

/**
 * **Où vont les commandes du poste de colisage**
 * (`documentation/livraisons/decisions-par-defaut-2026-10-02.md`, lot PC2) :
 * pour chaque tournée du jour, ses arrêts du dernier au premier, combien sont
 * prêts, et lesquels portent un bac partagé à refaire.
 *
 * Le fournil n'importe pas la livraison (`production → delivery` = ✗) : c'est
 * l'ÉCRAN qui lit les deux, comme le panneau « Bacs ». « Prête » vient du
 * commerce, la même source que « Ma tournée » (PL4). Une LECTURE.
 */
@QueryHandler(GetDeliveryPackingRoundsQuery)
export class GetDeliveryPackingRoundsHandler implements IQueryHandler<
  GetDeliveryPackingRoundsQuery,
  DeliveryPackingRoundsView
> {
  constructor(
    private readonly loading: DeliveryLoadingReader,
    private readonly orders: DeliveryOrdersReader,
    private readonly states: DeliveryOrderStatesReader,
  ) {}

  async execute(query: GetDeliveryPackingRoundsQuery): Promise<DeliveryPackingRoundsView> {
    const rounds = await this.loading.roundsOn(query.day);
    const orderIds = rounds.flatMap((round) => round.stops.map((stop) => stop.orderId));
    const bins = rounds.flatMap((round) => round.stops.flatMap((stop) => stop.bins));
    const [facts, places, states] = await Promise.all([
      this.orders.byIds(orderIds),
      this.loading.placesOf(ordersCitedBy(bins)),
      this.states.statesOf(orderIds),
    ]);
    return packingRoundsView(query.day, rounds, {
      names: namesByOrder(facts),
      places,
      ready: new Set(states.filter((state) => state.ready).map((state) => state.orderId)),
    });
  }
}
