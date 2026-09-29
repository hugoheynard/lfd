import type { DeliveryBinDetailView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryBinNotFoundError } from "../../domain/errors/delivery-loading-errors.js";
import { DeliveryLoadingReader } from "../../domain/ports/delivery-loading.reader.js";
import { binContextOf } from "../bin-context.js";
import { binDetailView } from "../delivery-loading-view.js";
import { GetDeliveryBinQuery } from "./get-delivery-bin.query.js";

/**
 * **Ouvrir le QR d'un bac** (L4-C13) : le bac, sa commande, sa tournée, et
 * s'il y est chargé. Une LECTURE — un aperçu de lien, un historique ou un
 * curieux qui scanne ne chargent rien ; « Charger » est un geste.
 *
 * @throws {DeliveryBinNotFoundError}
 */
@QueryHandler(GetDeliveryBinQuery)
export class GetDeliveryBinHandler implements IQueryHandler<
  GetDeliveryBinQuery,
  DeliveryBinDetailView
> {
  constructor(
    private readonly loading: DeliveryLoadingReader,
    private readonly orders: DeliveryOrdersReader,
  ) {}

  async execute(query: GetDeliveryBinQuery): Promise<DeliveryBinDetailView> {
    const bin = await this.loading.bin(query.binId);
    if (bin === null) {
      throw new DeliveryBinNotFoundError(query.binId);
    }
    const [orderBins, destination] = await Promise.all([
      this.loading.orderBins(bin.orderId),
      this.loading.destinationOf(bin.orderId, bin.id),
    ]);
    const context = await binContextOf(this.loading, this.orders, [bin, ...orderBins]);
    return binDetailView(bin, orderBins, context, destination);
  }
}
