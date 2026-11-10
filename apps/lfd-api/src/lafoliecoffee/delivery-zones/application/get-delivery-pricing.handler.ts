import type { DeliveryPricingView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DeliveryPricingReader } from "../domain/ports/delivery-pricing.reader.js";
import { GetDeliveryPricingQuery } from "./get-delivery-pricing.query.js";

/** Sert le réglage global de livraison au back-office. Lecture pure. */
@QueryHandler(GetDeliveryPricingQuery)
export class GetDeliveryPricingHandler implements IQueryHandler<
  GetDeliveryPricingQuery,
  DeliveryPricingView
> {
  constructor(private readonly pricing: DeliveryPricingReader) {}

  execute(): Promise<DeliveryPricingView> {
    return this.pricing.current();
  }
}
