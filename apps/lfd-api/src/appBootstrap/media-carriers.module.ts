import { Global, Module } from "@nestjs/common";

import { StorefrontModule } from "../b2b/storefront/storefront.module.js";
import { MediaCarriers } from "../media/channels/carriers/media-carriers.js";
import { CatalogueModule } from "../pim/catalogue/catalogue.module.js";
import { PrismaMediaCarriers } from "../pim/catalogue/shared/infrastructure/prisma-media-carriers.js";
import { CompositeMediaCarriers } from "./composite-media-carriers.js";
import { StorefrontMediaCarriers } from "./storefront-media-carriers.js";

/**
 * **Le fil des porteurs, relié.** Le pendant exact d'`ImageCatalogueModule`, et
 * dans l'autre sens : la médiathèque déclare « qui affiche cette image », le
 * référentiel y répond pour ses fiches et ses familles.
 *
 * Les deux fils ensemble font de `media` et `pim` deux blocs **des deux côtés
 * d'un canal** — le cas que `handover` était seul à connaître jusqu'ici. C'est
 * la forme normale de deux contextes qui ont besoin l'un de l'autre sans que
 * l'un possède l'autre.
 *
 * Depuis le 2026-09-24, la vitrine du commerce est un second porteur : le
 * token est lié à un {@link CompositeMediaCarriers} qui interroge les deux, et
 * échoue si l'un échoue (plan `documentation/order/plan-vitrine-enregistrement.md`, D9).
 *
 * `@Global` pour la raison des autres fils : le consommateur du port est
 * `media/`, qui ne peut pas importer le module qui le fournit sans devenir
 * dépendant du référentiel.
 */
@Global()
@Module({
  imports: [CatalogueModule, StorefrontModule],
  providers: [
    StorefrontMediaCarriers,
    // L'adaptateur du référentiel vient du module qui le construit ; celui de
    // la vitrine vit ici, faute de droit `b2b → media` dans la matrice.
    {
      provide: MediaCarriers,
      useFactory: (pim: PrismaMediaCarriers, storefront: StorefrontMediaCarriers) =>
        new CompositeMediaCarriers([pim, storefront]),
      inject: [PrismaMediaCarriers, StorefrontMediaCarriers],
    },
  ],
  exports: [MediaCarriers],
})
export class MediaCarriersModule {}
