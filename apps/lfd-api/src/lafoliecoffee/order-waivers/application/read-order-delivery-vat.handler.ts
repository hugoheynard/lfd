import type { OrderDeliveryVatView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DEFAULT_DELIVERY_VAT_MODE } from "../domain/order-delivery-vat.defaults.js";
import { OrderDeliveryVatRepository } from "../domain/order-delivery-vat.repository.js";
import { ReadOrderDeliveryVatQuery } from "./read-order-delivery-vat.query.js";

/**
 * Le mode qui s'applique — repli compris — et `configured`, pour que l'écran
 * ne présente pas le repli comme une décision du comptable.
 */
@QueryHandler(ReadOrderDeliveryVatQuery)
export class ReadOrderDeliveryVatHandler implements IQueryHandler<
  ReadOrderDeliveryVatQuery,
  OrderDeliveryVatView
> {
  constructor(private readonly settings: OrderDeliveryVatRepository) {}

  async execute(): Promise<OrderDeliveryVatView> {
    const mode = await this.settings.read();
    return { mode: mode ?? DEFAULT_DELIVERY_VAT_MODE, configured: mode !== null };
  }
}
