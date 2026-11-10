import type { OrderOpeningView, PublicOrderOpeningView } from "@lfd/contracts";
import { Controller, Get, Res } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";

import { Public } from "../../../platform/auth/public.decorator.js";
import { cachePublicSettings } from "../../shared/public-settings-cache/http/public-settings-cache-headers.js";
import { GetOrderOpeningQuery } from "../application/queries/get-order-opening.query.js";

/**
 * Lecture **publique** du réglage d'ouverture — la boutique ne propose pas un
 * bouton de commande que la passation refuserait. Le refus lui-même reste au
 * serveur (`OrderIntake`) : cette route informe, elle ne garde rien.
 *
 * Surface anonyme ⇒ throttle resserré (60/min/IP), comme `delivery-availability`.
 *
 * Gardée par Workers Cache (`public`, 30 s, étiquette `reglages-publics`) :
 * la réponse est la même pour tous, et chaque écriture du réglage la purge
 * (`PublicSettingsEdgeCache`, 2026-11-05).
 */
@Controller("order-opening")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class OrderOpeningController {
  constructor(private readonly queries: QueryBus) {}

  /**
   * Les deux clientèles et leurs premiers jours commandables, et rien d'autre :
   * l'auteur et l'instant restent dans la vue admin. Les dates sont celles de
   * la clientèle ; celle d'une personne exemptée se lit à `/order-admission`.
   */
  @Get()
  async read(@Res({ passthrough: true }) response: Response): Promise<PublicOrderOpeningView> {
    const settings = await this.queries.execute<GetOrderOpeningQuery, OrderOpeningView>(
      new GetOrderOpeningQuery(),
    );
    cachePublicSettings(response);
    return {
      ordersOpenToB2b: settings.ordersOpenToB2b,
      ordersOpenToB2c: settings.ordersOpenToB2c,
      firstServiceDayB2b: settings.firstServiceDayB2b ?? null,
      firstServiceDayB2c: settings.firstServiceDayB2c ?? null,
    };
  }
}
