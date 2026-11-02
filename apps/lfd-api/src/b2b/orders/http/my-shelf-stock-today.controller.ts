import { shelfStockTodayPickupSchema, type ShelfStockTodayView } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetShelfStockTodayQuery } from "../application/queries/get-shelf-stock-today.query.js";

/**
 * **La vitrine d'aujourd'hui d'un client reconnu** (plan du jour J, lot
 * L7b) : sa clientèle et son catalogue — réservations à sa société comprises
 * — sont décidés au serveur depuis la société agissante, jamais depuis un
 * paramètre. Un contrôleur à part de `ShelfStockTodayController`, qui est
 * `@Public()` au niveau de la classe : celui-ci est muré.
 */
@Controller("shelf-stock/today")
export class MyShelfStockTodayController {
  constructor(private readonly queries: QueryBus) {}

  @Get("mine")
  read(
    @ActingCompany() companyId: string | null,
    @Query("pickupAddressId", new ZodQuery(shelfStockTodayPickupSchema)) pickupAddressId: string,
  ): Promise<ShelfStockTodayView> {
    return this.queries.execute<GetShelfStockTodayQuery, ShelfStockTodayView>(
      new GetShelfStockTodayQuery(pickupAddressId, { kind: "acting", companyId }),
    );
  }
}
