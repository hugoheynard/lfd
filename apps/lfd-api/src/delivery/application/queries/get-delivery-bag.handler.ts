import type { DeliveryBagDetailView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryBagNotFoundError } from "../../domain/errors/delivery-loading-errors.js";
import { DeliveryLoadingReader } from "../../domain/ports/delivery-loading.reader.js";
import { bagDetailView, orderNamesOf } from "../delivery-loading-view.js";
import { GetDeliveryBagQuery } from "./get-delivery-bag.query.js";

/**
 * **Ouvrir le QR d'un sac** (L4-C13) : le sac, sa commande, sa tournée, et
 * s'il y est chargé. Une LECTURE — un aperçu de lien, un historique ou un
 * curieux qui scanne ne chargent rien ; « Charger » est un geste.
 *
 * @throws {DeliveryBagNotFoundError}
 */
@QueryHandler(GetDeliveryBagQuery)
export class GetDeliveryBagHandler implements IQueryHandler<
  GetDeliveryBagQuery,
  DeliveryBagDetailView
> {
  constructor(
    private readonly loading: DeliveryLoadingReader,
    private readonly orders: DeliveryOrdersReader,
  ) {}

  async execute(query: GetDeliveryBagQuery): Promise<DeliveryBagDetailView> {
    const bag = await this.loading.bag(query.bagId);
    if (bag === null) {
      throw new DeliveryBagNotFoundError(query.bagId);
    }
    const [orderBags, [order], destination] = await Promise.all([
      this.loading.orderBags(bag.orderId),
      this.orders.byIds([bag.orderId]),
      this.loading.destinationOf(bag.orderId, bag.id),
    ]);
    return bagDetailView(bag, orderBags, orderNamesOf(order), destination);
  }
}
