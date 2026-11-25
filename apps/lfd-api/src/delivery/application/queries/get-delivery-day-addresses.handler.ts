import type { DeliveryDayAddressesView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeliveryDayOrdersReader } from "../../channels/commerce/index.js";
import { GetDeliveryDayAddressesQuery } from "./get-delivery-day-addresses.query.js";

/**
 * **La vue « Aujourd'hui / Demain » de l'onglet « Adresses »** — les
 * livraisons du jour telles que le commerce les répond. Le classement par
 * heure et le rapprochement avec le carnet sont à l'écran, qui a déjà le
 * carnet entier.
 */
@QueryHandler(GetDeliveryDayAddressesQuery)
export class GetDeliveryDayAddressesHandler implements IQueryHandler<
  GetDeliveryDayAddressesQuery,
  DeliveryDayAddressesView
> {
  constructor(private readonly reader: DeliveryDayOrdersReader) {}

  async execute(query: GetDeliveryDayAddressesQuery): Promise<DeliveryDayAddressesView> {
    return { day: query.day, orders: await this.reader.deliveriesOn(query.day) };
  }
}
