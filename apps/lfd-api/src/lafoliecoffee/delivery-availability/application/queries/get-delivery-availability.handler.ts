import type { DeliveryAvailabilityView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DeliveryAvailabilityReader } from "../../domain/ports/delivery-availability.reader.js";
import { GetDeliveryAvailabilityQuery } from "./get-delivery-availability.query.js";

/** Sert le réglage de livraison, au back-office comme à la boutique. Lecture pure. */
@QueryHandler(GetDeliveryAvailabilityQuery)
export class GetDeliveryAvailabilityHandler implements IQueryHandler<
  GetDeliveryAvailabilityQuery,
  DeliveryAvailabilityView
> {
  constructor(private readonly settings: DeliveryAvailabilityReader) {}

  execute(): Promise<DeliveryAvailabilityView> {
    return this.settings.current();
  }
}
