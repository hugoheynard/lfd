import type { OrderOpeningView, PublicOrderOpeningView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { GetOrderOpeningQuery } from "../application/queries/get-order-opening.query.js";

/**
 * Lecture **publique** du réglage d'ouverture — la boutique ne propose pas un
 * bouton de commande que la passation refuserait. Le refus lui-même reste au
 * serveur (`OrderIntake`) : cette route informe, elle ne garde rien.
 *
 * Surface anonyme ⇒ throttle resserré (60/min/IP), comme `delivery-availability`.
 */
@Controller("order-opening")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class OrderOpeningController {
  constructor(private readonly queries: QueryBus) {}

  /** Les deux clientèles, et rien d'autre : l'auteur et l'instant restent dans la vue admin. */
  @Get()
  async read(): Promise<PublicOrderOpeningView> {
    const settings = await this.queries.execute<GetOrderOpeningQuery, OrderOpeningView>(
      new GetOrderOpeningQuery(),
    );
    return {
      ordersOpenToB2b: settings.ordersOpenToB2b,
      ordersOpenToB2c: settings.ordersOpenToB2c,
    };
  }
}
