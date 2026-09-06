import type { FulfillmentDayView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ListFulfillmentDaysQuery } from "../application/list-fulfillment-days.query.js";

/**
 * Lecture **publique** de la prochaine journée demandable — comme les points de
 * retrait, et pour la même raison : on choisit son service avant d'avoir un
 * compte. Rien de sensible n'y transite, seulement des dates que l'accueil du
 * laboratoire donnerait au téléphone.
 *
 * Surface anonyme ⇒ même throttle resserré que `pickup-addresses` (60/min/IP).
 */
@Controller("fulfillment-days")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class FulfillmentDaysController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(): Promise<readonly FulfillmentDayView[]> {
    return this.queries.execute<ListFulfillmentDaysQuery, readonly FulfillmentDayView[]>(
      new ListFulfillmentDaysQuery(),
    );
  }
}
