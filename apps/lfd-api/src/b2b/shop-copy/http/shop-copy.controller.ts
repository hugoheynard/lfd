import {
  shopCopyLocaleQuerySchema,
  type PublishedShopCopyView,
  type ShopCopyLocaleQuery,
} from "@lfd/contracts";
import { Controller, Get, Headers, Query, Res } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetPublishedShopCopyQuery } from "../application/queries/get-published-shop-copy.query.js";
import { clientHasEtag, SHOP_COPY_CACHE_CONTROL, shopCopyEtag } from "./shop-copy-cache-headers.js";

/**
 * **Les textes de la boutique, pour la boutique** — les remplacements publiés
 * d'une langue (plan `plan-textes-de-la-boutique.md`, §3, §4).
 *
 * Publique : la boutique les attend avant son premier dessin, connexion ou
 * pas. Cachable partout (`public`), étiquetée par la version : un navigateur
 * qui revient avec `If-None-Match` reçoit un `304` vide, et la lecture
 * elle-même ne touche pas la base tant que la version n'a pas bougé (cf.
 * `CachedPublishedShopCopyReader`).
 *
 * Throttle large : chaque visiteur la lit une fois par langue, et une boutique
 * derrière un même réseau (un bureau, une école) ne doit pas se la voir
 * refuser.
 */
@Controller("shop/copy")
@Public()
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class ShopCopyController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  async published(
    @Query(new ZodQuery(shopCopyLocaleQuerySchema)) query: ShopCopyLocaleQuery,
    @Headers("if-none-match") ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublishedShopCopyView | undefined> {
    const view = await this.queries.execute<GetPublishedShopCopyQuery, PublishedShopCopyView>(
      new GetPublishedShopCopyQuery(query.locale),
    );
    const etag = shopCopyEtag(view.version, view.locale);
    response.setHeader("ETag", etag);
    response.setHeader("Cache-Control", SHOP_COPY_CACHE_CONTROL);
    if (clientHasEtag(ifNoneMatch, etag)) {
      response.status(304);
      return undefined;
    }
    return view;
  }
}
