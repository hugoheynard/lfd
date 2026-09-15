import type { DeliverySettingsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DeliverySettingsReader } from "../../domain/ports/delivery-settings.reader.js";
import { GetDeliverySettingsQuery } from "./get-delivery-settings.query.js";

/** Sert le réglage de livraison, au back-office comme à la boutique. Lecture pure. */
@QueryHandler(GetDeliverySettingsQuery)
export class GetDeliverySettingsHandler implements IQueryHandler<
  GetDeliverySettingsQuery,
  DeliverySettingsView
> {
  constructor(private readonly settings: DeliverySettingsReader) {}

  execute(): Promise<DeliverySettingsView> {
    return this.settings.current();
  }
}
