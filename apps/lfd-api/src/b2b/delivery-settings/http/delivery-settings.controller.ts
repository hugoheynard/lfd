import type { DeliverySettingsView, PublicDeliverySettingsView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { GetDeliverySettingsQuery } from "../application/queries/get-delivery-settings.query.js";

/**
 * Lecture **publique** du réglage de livraison — la boutique ne propose pas une
 * livraison que la caisse refuserait. Le refus lui-même reste au serveur
 * (`CartAdjustments.forDelivery`) : cette route informe, elle ne garde rien.
 *
 * Surface anonyme ⇒ throttle resserré (60/min/IP), comme les zones et les points.
 */
@Controller("delivery-settings")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class DeliverySettingsController {
  constructor(private readonly queries: QueryBus) {}

  /**
   * Les deux clientèles, et rien d'autre : l'auteur et l'instant du réglage
   * restent dans la vue admin — un nom d'agent ne se sert pas sans jeton.
   */
  @Get()
  async read(): Promise<PublicDeliverySettingsView> {
    const settings = await this.queries.execute<GetDeliverySettingsQuery, DeliverySettingsView>(
      new GetDeliverySettingsQuery(),
    );
    return { openToB2b: settings.openToB2b, openToB2c: settings.openToB2c };
  }
}
