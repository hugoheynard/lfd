import { shelfStockTodayPickupSchema, type ShelfStockTodayView } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetShelfStockTodayQuery } from "../application/queries/get-shelf-stock-today.query.js";

const audienceQuerySchema = z.enum(["pro", "public"]).optional();

/**
 * **La vitrine d'aujourd'hui, sans connexion** (plan du jour J, lot L7b) —
 * publique comme `/fulfillment-days`, dont elle prend l'audience annoncée
 * (`?audience=pro|public`, `public` par défaut) : un visiteur anonyme ne
 * peut s'élargir qu'au rayon pro PUBLIC, qui ne porte ni article réservé ni
 * sur mesure. Un client reconnu lit `/shelf-stock/today/mine`.
 *
 * Réponse personnelle à l'audience : aucun `Cache-Control` public ici, le
 * middleware de l'API pose le sien.
 *
 * Surface anonyme ⇒ même throttle resserré que `fulfillment-days` (60/min/IP).
 */
@Controller("shelf-stock/today")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class ShelfStockTodayController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  read(
    @Query("pickupAddressId", new ZodQuery(shelfStockTodayPickupSchema)) pickupAddressId: string,
    @Query("audience", new ZodQuery(audienceQuerySchema)) audience: "pro" | "public" | undefined,
  ): Promise<ShelfStockTodayView> {
    return this.queries.execute<GetShelfStockTodayQuery, ShelfStockTodayView>(
      new GetShelfStockTodayQuery(pickupAddressId, {
        kind: "anonymous",
        audience: audience ?? "public",
      }),
    );
  }
}
