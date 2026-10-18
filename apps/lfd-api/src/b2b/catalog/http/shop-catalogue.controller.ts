import { contentLocales, type ContentLocale, type ShopCatalogueView } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";

import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReadShopCatalogueQuery } from "../application/queries/read-shop-catalogue.js";
import { CATALOG_SOURCE_LANGUAGE } from "../domain/catalog-translations.js";

/**
 * `?lang=fr|en|it`, facultatif — absent, le français : la vue d'avant le lot
 * des langues, que la boutique déployée lit encore. Une langue inconnue est un
 * 400 qui la nomme, pas un repli muet : un lecteur qui demande `de` doit
 * apprendre qu'on ne la sert pas.
 */
const languageQuerySchema = z
  .enum(contentLocales, `langue inconnue : « lang » accepte ${contentLocales.join(", ")}`)
  .default(CATALOG_SOURCE_LANGUAGE);

/**
 * **Le catalogue de la boutique**, en un appel et sans jeton.
 *
 * Publique parce que la boutique l'est : la branche cliente se rend sans
 * attendre Auth0, et aucune de ses routes ne porte de garde. On visite d'abord,
 * on s'identifie pour régler. Une route murée aurait rendu la vitrine
 * inaccessible à qui n'a pas encore de compte — c'est-à-dire à tout prospect.
 *
 * ⚠️ **Elle servait le prix CANONIQUE jusqu'au 2026-09-09**, et la raison écrite
 * ici était fausse à moitié : « elle n'a pas de client ». Un prix **négocié**
 * exige effectivement un client, et cette route ne le sert pas. Une **promotion
 * publique** n'en exige aucun — elle était donc invisible au rayon et
 * n'apparaissait qu'au panier (R22).
 *
 * Elle sert désormais le prix **résolu à `companyId: null`** : promotions
 * comprises, mercuriale exclue, tarif barré quand le prix servi est plus bas.
 * Le second chemin annoncé ici existe (`/shop/catalogue/mine`) et appelle **la
 * même** logique avec un client.
 *
 * Surface anonyme ⇒ throttle resserré (60/min/IP) sous le défaut global, comme
 * `pickup-addresses` : c'est la partie la plus exposée de l'API, aucune auth ne
 * la précède.
 *
 * 🔴 **Un seul appel, et c'est le sujet du chantier.** Rayons et articles
 * voyagent ensemble : deux routes rendraient possible un état où la vitrine
 * connaît des articles dont elle ignore le rayon, et doubleraient le coût d'une
 * ouverture de boutique.
 *
 * `?lang=en|it` (lot des langues, 2026-10-18) : noms, lignes et rayons dans
 * cette langue, en français quand le référentiel ne les a pas traduits. La
 * vitrine de l'agence (lot W) relira la même vue dans les trois langues.
 */
@Controller("shop/catalogue")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class ShopCatalogueController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  read(
    @Query("lang", new ZodQuery(languageQuerySchema)) language: ContentLocale,
  ): Promise<ShopCatalogueView> {
    return this.queries.execute<ReadShopCatalogueQuery, ShopCatalogueView>(
      new ReadShopCatalogueQuery(language),
    );
  }
}
