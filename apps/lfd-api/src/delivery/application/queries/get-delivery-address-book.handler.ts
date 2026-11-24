import type { DeliveryAddressBookView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeliveryAddressBookReader } from "../../channels/commerce/index.js";
import { GetDeliveryAddressBookQuery } from "./get-delivery-address-book.query.js";

/**
 * **L'onglet « Adresses » de Tour manager** — le carnet tel que le commerce le
 * répond, sans retouche : le tri et l'écart des archivées sont à lui.
 */
@QueryHandler(GetDeliveryAddressBookQuery)
export class GetDeliveryAddressBookHandler implements IQueryHandler<
  GetDeliveryAddressBookQuery,
  DeliveryAddressBookView
> {
  constructor(private readonly reader: DeliveryAddressBookReader) {}

  async execute(): Promise<DeliveryAddressBookView> {
    return { addresses: await this.reader.deliveryAddresses() };
  }
}
