import type { DeliveryAddressBookView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../platform/auth/admin-surface.decorator.js";
import { GetDeliveryAddressBookQuery } from "../application/queries/get-delivery-address-book.query.js";

/**
 * **Le carnet des adresses de livraison** — l'onglet « Adresses » de Tour
 * manager : points, consignes, procédure, pour tous les clients. Sous
 * `delivery_rounds:read` : ce sont les consignes que les tournées lisent déjà.
 * Il n'injecte que le bus.
 */
@Controller("admin/delivery/address-book")
@AdminSurface("delivery_rounds")
export class DeliveryAddressBookController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  @RequirePermission("delivery_rounds:read")
  addressBook(): Promise<DeliveryAddressBookView> {
    return this.queries.execute<GetDeliveryAddressBookQuery, DeliveryAddressBookView>(
      new GetDeliveryAddressBookQuery(),
    );
  }
}
