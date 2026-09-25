import type { FulfillmentDayView } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ListFulfillmentDaysQuery } from "../application/list-fulfillment-days.query.js";

/** Les SKU du panier, séparés par des virgules — la borne d'un devis (cent lignes). */
const cartSkusQuerySchema = z.string().max(4000).optional();
const audienceQuerySchema = z.enum(["pro", "public"]).optional();

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

  /**
   * `?skus=PAT-002,VIE-001` — le panier, facultatif ; `?audience=pro|public`,
   * `public` par défaut. Sans panier, la réponse d'hier. Avec, seuls les jours
   * de retrait d'une opération datée restent proposables (D6).
   */
  @Get()
  list(
    @Query("skus", new ZodQuery(cartSkusQuerySchema)) skus: string | undefined,
    @Query("audience", new ZodQuery(audienceQuerySchema)) audience: "pro" | "public" | undefined,
  ): Promise<readonly FulfillmentDayView[]> {
    const cartSkus = skus === undefined ? [] : skus.split(",").filter((sku) => sku.length > 0);
    return this.queries.execute<ListFulfillmentDaysQuery, readonly FulfillmentDayView[]>(
      new ListFulfillmentDaysQuery(cartSkus, audience ?? "public"),
    );
  }
}
