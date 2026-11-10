import type { DeliveryAvailabilityView, PublicDeliveryAvailabilityView } from "@lfd/contracts";
import { Controller, Get, Res } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";

import { Public } from "../../../platform/auth/public.decorator.js";
import { cachePublicSettings } from "../../shared/public-settings-cache/http/public-settings-cache-headers.js";
import { GetDeliveryAvailabilityQuery } from "../application/queries/get-delivery-availability.query.js";

/**
 * Lecture **publique** du réglage de livraison — la boutique ne propose pas une
 * livraison que la caisse refuserait. Le refus lui-même reste au serveur
 * (`CartAdjustments.forDelivery`) : cette route informe, elle ne garde rien.
 *
 * Surface anonyme ⇒ throttle resserré (60/min/IP), comme les zones et les points.
 *
 * Gardée par Workers Cache (`public`, 30 s, étiquette `reglages-publics`) :
 * la réponse est la même pour tous, et chaque écriture du réglage la purge
 * (`PublicSettingsEdgeCache`, 2026-11-05).
 */
@Controller("delivery-availability")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class DeliveryAvailabilityController {
  constructor(private readonly queries: QueryBus) {}

  /**
   * Les deux clientèles et le mode créneau / échéance, et rien d'autre : l'auteur et l'instant du réglage
   * restent dans la vue admin — un nom d'agent ne se sert pas sans jeton.
   */
  @Get()
  async read(
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicDeliveryAvailabilityView> {
    const settings = await this.queries.execute<
      GetDeliveryAvailabilityQuery,
      DeliveryAvailabilityView
    >(new GetDeliveryAvailabilityQuery());
    cachePublicSettings(response);
    return {
      openToB2b: settings.openToB2b,
      openToB2c: settings.openToB2c,
      windowMode: settings.windowMode,
    };
  }
}
