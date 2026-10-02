import type { DeliveryOrderBinsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryLoadingReader } from "../../domain/ports/delivery-loading.reader.js";
import { binContextOf } from "../bin-context.js";
import { orderBinsView } from "../delivery-loading-view.js";
import { orderStopOf, roundPlaceView } from "../order-round-place.js";
import { GetDeliveryOrderBinsQuery } from "./get-delivery-order-bins.query.js";

/**
 * Les bacs d'une commande, annulés compris — ce que sert la page d'étiquettes
 * imprimable (L4-C16). Une LECTURE : réimprimer ne crée rien, n'écrit rien.
 *
 * Avec la tournée et la position de l'arrêt (lot PC3, 2026-10-02) : l'étiquette
 * les imprime en gros, pour poser le bac dans la zone de sa tournée.
 */
@QueryHandler(GetDeliveryOrderBinsQuery)
export class GetDeliveryOrderBinsHandler implements IQueryHandler<
  GetDeliveryOrderBinsQuery,
  DeliveryOrderBinsView
> {
  constructor(
    private readonly loading: DeliveryLoadingReader,
    private readonly orders: DeliveryOrdersReader,
  ) {}

  async execute(query: GetDeliveryOrderBinsQuery): Promise<DeliveryOrderBinsView> {
    const bins = await this.loading.orderBins(query.orderId);
    const context = await binContextOf(this.loading, this.orders, bins, [query.orderId]);
    const round = roundPlaceView(await orderStopOf(this.loading, query.orderId));
    return { ...orderBinsView(query.orderId, bins, context), round };
  }
}
