import { Global, Module } from "@nestjs/common";

import { CatalogModule as CommerceCatalogModule } from "../b2b/catalog/catalog.module.js";
import { StorefrontModule } from "../b2b/storefront/storefront.module.js";
import { MediaCarriers } from "../media/channels/carriers/media-carriers.js";
import { CatalogueModule } from "../pim/catalogue/catalogue.module.js";
import { PrismaMediaCarriers } from "../pim/catalogue/shared/infrastructure/prisma-media-carriers.js";
import { CatalogCopyMediaCarriers } from "./catalog-copy-media-carriers.js";
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
 * Depuis le 2026-10-10 (R18), un troisième : les COPIES d'images du catalogue
 * du commerce (`catalog_operations`), qui retiennent l'ancienne image d'une
 * opération jusqu'au push suivant — elles ne se repointent pas.
 *
 * `@Global` pour la raison des autres fils : le consommateur du port est
 * `media/`, qui ne peut pas importer le module qui le fournit sans devenir
 * dépendant du référentiel.
 */
@Global()
@Module({
  imports: [CatalogueModule, StorefrontModule, CommerceCatalogModule],
  providers: [
    StorefrontMediaCarriers,
    CatalogCopyMediaCarriers,
    // L'adaptateur du référentiel vient du module qui le construit ; celui de
    // la vitrine vit ici, faute de droit `b2b → media` dans la matrice.
    {
      provide: MediaCarriers,
      useFactory: (
        pim: PrismaMediaCarriers,
        storefront: StorefrontMediaCarriers,
        copies: CatalogCopyMediaCarriers,
      ) => new CompositeMediaCarriers([pim, storefront, copies]),
      inject: [PrismaMediaCarriers, StorefrontMediaCarriers, CatalogCopyMediaCarriers],
    },
  ],
  exports: [MediaCarriers],
})
export class MediaCarriersModule {}
