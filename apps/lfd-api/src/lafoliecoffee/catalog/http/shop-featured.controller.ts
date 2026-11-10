import {
  contentLocales,
  type ContentLocale,
  type ShopFeaturedAudience,
  type ShopFeaturedView,
} from "@lfd/contracts";
import { Controller, Get, Query, Res } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { z } from "zod";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import type { PublicShelfReply } from "../application/public-shelf-cacheability.js";
import { ReadPublicShopFeaturedQuery } from "../application/queries/read-public-shop-featured.query.js";
import { CATALOG_SOURCE_LANGUAGE } from "../domain/catalog-translations.js";
import { offerPublicShelf } from "./public-shelf-cache-headers.js";

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
 *
 * **Workers Cache** (C3) : même décision que `/shop/catalogue` — `public,
 * max-age=30` seulement si le drapeau public est allumé et que rien n'a bougé
 * pendant le calcul. Juste avec un jeton : cette route ne lit JAMAIS
 * l'appelant (vérifié le 2026-11-04, `anonymousViewer` ; `lint:cache-control`).
 */
@Controller("shop/featured")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class ShopFeaturedController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  async read(
    @Query("audience", new ZodQuery(audienceQuerySchema)) audience: ShopFeaturedAudience,
    @Query("lang", new ZodQuery(languageQuerySchema)) language: ContentLocale,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ShopFeaturedView> {
    const reply = await this.queries.execute<
      ReadPublicShopFeaturedQuery,
      PublicShelfReply<ShopFeaturedView>
    >(new ReadPublicShopFeaturedQuery(audience, language));
    offerPublicShelf(response, reply);
    return reply.view;
  }
}
