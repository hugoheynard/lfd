import {
  contentLocales,
  type ContentLocale,
  type ShopFeaturedAudience,
  type ShopFeaturedView,
} from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReadShopFeaturedQuery } from "../application/queries/read-shop-featured.query.js";
import { CATALOG_SOURCE_LANGUAGE } from "../domain/catalog-translations.js";

const FEATURED_AUDIENCES = ["pro"] as const satisfies readonly ShopFeaturedAudience[];

/** `pro` seul (2026-10-19) : une autre audience est un 400 qui dit laquelle on sert. */
const audienceQuerySchema = z.enum(
  FEATURED_AUDIENCES,
  `audience inconnue : « audience » n'accepte que ${FEATURED_AUDIENCES.join(", ")} pour l'instant`,
);

/** Comme `/shop/catalogue` : facultative, le français par défaut, 400 sur une langue inconnue. */
const languageQuerySchema = z
  .enum(contentLocales, `langue inconnue : « lang » accepte ${contentLocales.join(", ")}`)
  .default(CATALOG_SOURCE_LANGUAGE);

/**
 * **Les incontournables d'une audience**, sans jeton — la landing publique
 * `/pro` de la boutique (Hugo, 2026-10-19).
 *
 * 🔴 **Sans prix** (2026-10-19) : un prix pro dépend de la société
 * (mercuriale, remises, tarif de canal) ; à un visiteur qui n'a pas de compte,
 * on n'en montre aucun. Il le verra une fois reconnu, sur `/shop/catalogue/mine`.
 *
 * Même throttle que `/shop/catalogue` (60/min/IP) : surface anonyme.
 */
@Controller("shop/featured")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class ShopFeaturedController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  read(
    @Query("audience", new ZodQuery(audienceQuerySchema)) audience: ShopFeaturedAudience,
    @Query("lang", new ZodQuery(languageQuerySchema)) language: ContentLocale,
  ): Promise<ShopFeaturedView> {
    return this.queries.execute<ReadShopFeaturedQuery, ShopFeaturedView>(
      new ReadShopFeaturedQuery(audience, language),
    );
  }
}
