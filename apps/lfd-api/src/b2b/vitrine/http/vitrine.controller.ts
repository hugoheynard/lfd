import {
  contentLocales,
  VITRINE_KEY_HEADER,
  type ContentLocale,
  type VitrineCatalogueView,
  type VitrineItemView,
  type VitrineTextsView,
} from "@lfd/contracts";
import { Controller, Get, Headers, Param, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReadVitrineArticleQuery } from "../application/queries/read-vitrine-article.query.js";
import { ReadVitrineCatalogueQuery } from "../application/queries/read-vitrine-catalogue.query.js";
import { ReadVitrineTextsQuery } from "../application/queries/read-vitrine-texts.query.js";

/** `?lang=fr|en|it`, le français par défaut — comme `GET /shop/catalogue`. */
const languageQuerySchema = z
  .enum(contentLocales, `langue inconnue : « lang » accepte ${contentLocales.join(", ")}`)
  .default("fr");

/**
 * **Les lectures de l'agence du site vitrine** (plan
 * `documentation/webhooks/plan-webhook-vitrine.md`, W6 et S4) : après une
 * notification, elle relit ici.
 *
 * `@Public()` parce que la vue l'est déjà (`GET /shop/catalogue`) : la clé
 * de l'en-tête `X-Vitrine-Key` IDENTIFIE l'abonné et applique ses cases, elle
 * ne protège rien. Le débit est borné par IP, comme la boutique — la
 * passerelle route par déployable, pas par chemin.
 */
@Controller("vitrine")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class VitrineController {
  constructor(private readonly queries: QueryBus) {}

  @Get("catalogue")
  catalogue(
    @Headers(VITRINE_KEY_HEADER) readKey: string | undefined,
    @Query("lang", new ZodQuery(languageQuerySchema)) language: ContentLocale,
  ): Promise<VitrineCatalogueView> {
    return this.queries.execute<ReadVitrineCatalogueQuery, VitrineCatalogueView>(
      new ReadVitrineCatalogueQuery(readKey, language),
    );
  }

  @Get("articles/:sku")
  article(
    @Headers(VITRINE_KEY_HEADER) readKey: string | undefined,
    @Param("sku") sku: string,
    @Query("lang", new ZodQuery(languageQuerySchema)) language: ContentLocale,
  ): Promise<VitrineItemView> {
    return this.queries.execute<ReadVitrineArticleQuery, VitrineItemView>(
      new ReadVitrineArticleQuery(readKey, sku, language),
    );
  }

  @Get("textes")
  texts(
    @Headers(VITRINE_KEY_HEADER) readKey: string | undefined,
    @Query("lang", new ZodQuery(languageQuerySchema)) language: ContentLocale,
  ): Promise<VitrineTextsView> {
    return this.queries.execute<ReadVitrineTextsQuery, VitrineTextsView>(
      new ReadVitrineTextsQuery(readKey, language),
    );
  }
}
