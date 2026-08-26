import { Module } from "@nestjs/common";
import { RouterModule } from "@nestjs/core";

import { CatalogueModule } from "./catalogue/catalogue.module.js";
import { B2bPlatformModule } from "./channels/b2b-platform/b2b-platform.module.js";
import { ShopifyModule } from "./channels/shopify/shopify.module.js";
import { VatRatesModule } from "./vat-rates/vat-rates.module.js";
import { PointsOfSaleModule } from "./points-of-sale/points-of-sale.module.js";
import { SalesContextsModule } from "./sales-contexts/sales-contexts.module.js";

/**
 * Le **référentiel produit** — un contexte du processus, plus une application.
 *
 * Ce qui a disparu en passant de l'un à l'autre : le chargement de
 * l'environnement, la passerelle de configuration, le rate-limiting et
 * l'authentification. Aucune de ces quatre choses n'appartenait au PIM ; elles
 * appartiennent au **processus**, et le PIM n'en avait sa propre copie que
 * parce qu'il était seul dans la sienne. La racine de composition les monte une
 * fois pour tout le monde.
 *
 * Ce qui reste est le référentiel lui-même : le catalogue, ses canaux de
 * sortie, la TVA et les points de vente. Ils gardent **leur** base, par
 * `PimDatabaseModule` (non global, importé module par module).
 *
 * Le préfixe de routes (`pim`, et `channels/shopify` · `channels/b2b` en
 * dessous) est monté par `AppModule` : les contrôleurs ne déclarent que leur
 * sous-chemin.
 */
@Module({
  imports: [
    CatalogueModule,
    VatRatesModule,
    PointsOfSaleModule,
    SalesContextsModule,
    ShopifyModule,
    B2bPlatformModule,
    // La hiérarchie de routes du référentiel, déclarée ici plutôt qu'à la
    // racine : c'est la disposition **interne** du PIM, et la racine n'a pas à
    // connaître le nom de ses canaux. Le préfixe `pim` isole le contexte dans
    // l'espace d'URL du processus — deux contextes à plat finissent par se
    // disputer un `/products`, et on ne le découvre qu'en production.
    RouterModule.register([
      {
        path: "pim",
        children: [
          CatalogueModule,
          VatRatesModule,
          PointsOfSaleModule,
          SalesContextsModule,
          {
            path: "channels",
            children: [
              { path: "shopify", module: ShopifyModule },
              { path: "b2b", module: B2bPlatformModule },
            ],
          },
        ],
      },
    ]),
  ],
})
export class PimModule {}
