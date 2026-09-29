import type { DeliveryOrderBagsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryLoadingReader } from "../../domain/ports/delivery-loading.reader.js";
import { orderBagsView, orderNamesOf } from "../delivery-loading-view.js";
import { GetDeliveryOrderBagsQuery } from "./get-delivery-order-bags.query.js";

/**
 * Les sacs d'une commande, annulés compris — ce que sert la page d'étiquettes
 * imprimable (L4-C16). Une LECTURE : réimprimer ne crée rien, n'écrit rien.
 */
@QueryHandler(GetDeliveryOrderBagsQuery)
export class GetDeliveryOrderBagsHandler implements IQueryHandler<
  GetDeliveryOrderBagsQuery,
  DeliveryOrderBagsView
> {
  constructor(
    private readonly loading: DeliveryLoadingReader,
    private readonly orders: DeliveryOrdersReader,
  ) {}

  async execute(query: GetDeliveryOrderBagsQuery): Promise<DeliveryOrderBagsView> {
    const [bags, [order]] = await Promise.all([
      this.loading.orderBags(query.orderId),
      this.orders.byIds([query.orderId]),
    ]);
    return orderBagsView(query.orderId, bags, orderNamesOf(order));
  }
}
