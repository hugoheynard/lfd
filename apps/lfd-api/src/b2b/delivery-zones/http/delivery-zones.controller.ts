import type { DeliveryZoneView } from "@lfd/contracts";
import { Controller, Get, Res } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";

import { Public } from "../../../platform/auth/public.decorator.js";
import { cachePublicSettings } from "../../shared/public-settings-cache/http/public-settings-cache-headers.js";
import { ListDeliveryZonesQuery } from "../application/list-delivery-zones.query.js";

/**
 * Lecture **publique** des zones de livraison — le client (checkout) en a besoin
 * pour afficher le frais de sa zone. Non sensible (config globale). L'écriture est
 * staff ({@link AdminDeliveryZonesController}).
 *
 * Surface anonyme ⇒ throttle resserré (60/min/IP) sous le défaut global.
 *
 * Gardée par Workers Cache (`public`, 30 s, étiquette `reglages-publics`) :
 * la réponse est la même pour tous, et chaque écriture du réglage la purge
 * (`PublicSettingsEdgeCache`, 2026-11-05).
 */
@Controller("delivery-zones")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class DeliveryZonesController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  async list(@Res({ passthrough: true }) response: Response): Promise<readonly DeliveryZoneView[]> {
    const zones = await this.queries.execute<ListDeliveryZonesQuery, readonly DeliveryZoneView[]>(
      new ListDeliveryZonesQuery(),
    );
    cachePublicSettings(response);
    return zones;
  }
}
