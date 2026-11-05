import type { AudienceDeliveryZoneView, CustomerAudience } from "@lfd/contracts";
import { Controller, Get, Query, Res } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { z } from "zod";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { cachePublicSettings } from "../../shared/public-settings-cache/http/public-settings-cache-headers.js";
import { ListDeliveryZonesQuery } from "../application/list-delivery-zones.query.js";

/**
 * `?audience=b2b|b2c` — la clientèle dont on veut les frais. Absent = celle d'un
 * visiteur (`b2c`, `audienceOf(null)`), comme `GET /pickup-addresses` sans
 * paramètre. Toute autre valeur est refusée (400) plutôt que ramenée au
 * particulier : une faute de frappe ne doit pas afficher en silence le frais
 * d'une autre clientèle.
 */
const audienceSchema = z.enum(["b2b", "b2c"]).optional();

/** La clientèle d'un visiteur, quand l'appel n'en déclare aucune. */
const VISITOR_AUDIENCE: CustomerAudience = "b2c";

/**
 * Lecture **publique** des zones de livraison — la boutique et la saisie du
 * staff en ont besoin pour afficher le frais d'une zone. L'écriture est staff
 * ({@link AdminDeliveryZonesController}).
 *
 * Depuis le 0c (`plan-livraison-offerte.md`, 2026-11-05) : chaque zone porte le
 * frais et le seuil de livraison offerte RÉSOLUS pour la clientèle déclarée —
 * ceux que le devis facture. L'audience se DÉCLARE, elle ne se lit pas sur
 * l'appelant : le tarif pro est public par choix (Hugo, décision f), comme la
 * vitrine pro, et la saisie du staff lit celui de son client en le déclarant.
 *
 * Surface anonyme ⇒ throttle resserré (60/min/IP) sous le défaut global.
 *
 * Gardée par Workers Cache (`public`, 30 s, étiquette `reglages-publics`) : une
 * adresse de cache par audience (la clé est l'URL, paramètre compris), et
 * chaque écriture d'une zone ou du réglage global la purge
 * (`PublicSettingsEdgeCache`).
 */
@Controller("delivery-zones")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class DeliveryZonesController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  async list(
    @Query("audience", new ZodQuery(audienceSchema)) audience: CustomerAudience | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<readonly AudienceDeliveryZoneView[]> {
    const zones = await this.queries.execute<
      ListDeliveryZonesQuery,
      readonly AudienceDeliveryZoneView[]
    >(new ListDeliveryZonesQuery(audience ?? VISITOR_AUDIENCE));
    cachePublicSettings(response);
    return zones;
  }
}
