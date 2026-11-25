import type { DeliveryAddressBookView, DeliveryDayAddressesView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface, RequirePermission } from "../../platform/auth/admin-surface.decorator.js";
import { GetDeliveryAddressBookQuery } from "../application/queries/get-delivery-address-book.query.js";
import { GetDeliveryDayAddressesQuery } from "../application/queries/get-delivery-day-addresses.query.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "jour attendu au format AAAA-MM-JJ");

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

  /** Les livraisons attendues ce jour-là : la vue « Aujourd'hui / Demain ». */
  @Get("day/:day")
  @RequirePermission("delivery_rounds:read")
  dayAddresses(
    @Param("day", new ZodQuery(daySchema)) day: string,
  ): Promise<DeliveryDayAddressesView> {
    return this.queries.execute<GetDeliveryDayAddressesQuery, DeliveryDayAddressesView>(
      new GetDeliveryDayAddressesQuery(day),
    );
  }
}
