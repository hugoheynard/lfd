import {
  contentLocales,
  VITRINE_KEY_HEADER,
  type ContentLocale,
  type VitrineCatalogueView,
  type VitrineItemView,
  type VitrineTextsView,
} from "@lfd/contracts";
import { Controller, Get, Headers, Param, Query, Res, StreamableFile } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { z } from "zod";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReadVitrineArticleQuery } from "../application/queries/read-vitrine-article.query.js";
import { ReadVitrineCatalogueQuery } from "../application/queries/read-vitrine-catalogue.query.js";
import { ReadVitrineTextsQuery } from "../application/queries/read-vitrine-texts.query.js";
import {
  formatQuerySchema,
  VITRINE_XSD,
  vitrineRepresentation,
  xmlFile,
  type VitrineFormat,
} from "./vitrine-representation.js";

/** `?lang=fr|en|it`, le français par défaut — comme `GET /shop/catalogue`. */
const languageQuerySchema = z
  .enum(contentLocales, `langue inconnue : « lang » accepte ${contentLocales.join(", ")}`)
  .default("fr");

/**
 * **Les lectures de l'agence du site vitrine** (plan
 * `documentation/webhooks/vitrine.md` §6) : après une
 * notification, elle relit ici.
 *
 * `@Public()` parce que la vue l'est déjà (`GET /shop/catalogue`) : la clé
 * de l'en-tête `X-Vitrine-Key` IDENTIFIE l'abonné et applique ses cases, elle
 * ne protège rien. Le débit est borné par IP, comme la boutique — la
 * passerelle route par déployable, pas par chemin.
 *
 * Chaque lecture se sert aussi en XML (Hugo, 2026-10-18) : `Accept:
 * application/xml` ou `?format=xml`, décrit par `GET /vitrine/schema.xsd`.
 */
@Controller("vitrine")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class VitrineController {
  constructor(private readonly queries: QueryBus) {}

  @Get("catalogue")
  async catalogue(
    @Headers(VITRINE_KEY_HEADER) readKey: string | undefined,
    @Headers("accept") accept: string | undefined,
    @Query("lang", new ZodQuery(languageQuerySchema)) language: ContentLocale,
    @Query("format", new ZodQuery(formatQuerySchema)) format: VitrineFormat,
    @Res({ passthrough: true }) response: Response,
  ): Promise<VitrineCatalogueView | StreamableFile> {
    const view = await this.queries.execute<ReadVitrineCatalogueQuery, VitrineCatalogueView>(
      new ReadVitrineCatalogueQuery(readKey, language),
    );
    return vitrineRepresentation(view, "catalogue", { format, accept }, response);
  }

  @Get("articles/:sku")
  async article(
    @Headers(VITRINE_KEY_HEADER) readKey: string | undefined,
    @Headers("accept") accept: string | undefined,
    @Param("sku") sku: string,
    @Query("lang", new ZodQuery(languageQuerySchema)) language: ContentLocale,
    @Query("format", new ZodQuery(formatQuerySchema)) format: VitrineFormat,
    @Res({ passthrough: true }) response: Response,
  ): Promise<VitrineItemView | StreamableFile> {
    const view = await this.queries.execute<ReadVitrineArticleQuery, VitrineItemView>(
      new ReadVitrineArticleQuery(readKey, sku, language),
    );
    return vitrineRepresentation(view, "item", { format, accept }, response);
  }

  @Get("textes")
  async texts(
    @Headers(VITRINE_KEY_HEADER) readKey: string | undefined,
    @Headers("accept") accept: string | undefined,
    @Query("lang", new ZodQuery(languageQuerySchema)) language: ContentLocale,
    @Query("format", new ZodQuery(formatQuerySchema)) format: VitrineFormat,
    @Res({ passthrough: true }) response: Response,
  ): Promise<VitrineTextsView | StreamableFile> {
    const view = await this.queries.execute<ReadVitrineTextsQuery, VitrineTextsView>(
      new ReadVitrineTextsQuery(readKey, language),
    );
    return vitrineRepresentation(view, "texts", { format, accept }, response);
  }

  /** Le schéma des trois lectures XML. Sans clé : un schéma ne dit rien de personne. */
  @Get("schema.xsd")
  schema(@Res({ passthrough: true }) response: Response): StreamableFile {
    return xmlFile(VITRINE_XSD, response);
  }
}
