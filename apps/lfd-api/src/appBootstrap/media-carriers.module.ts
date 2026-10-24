import { Global, Module } from "@nestjs/common";

import { CatalogModule as CommerceCatalogModule } from "../b2b/catalog/catalog.module.js";
import { CommerceOperationsModule } from "../b2b/operations/operations.module.js";
import { StorefrontModule } from "../b2b/storefront/storefront.module.js";
import { MediaCarriers } from "../media/channels/carriers/media-carriers.js";
import { CatalogueModule } from "../pim/catalogue/catalogue.module.js";
import { PrismaMediaCarriers } from "../pim/catalogue/shared/infrastructure/prisma-media-carriers.js";
import { CommerceOperationMediaCarriers } from "./commerce-operation-media-carriers.js";
import { CompositeMediaCarriers } from "./composite-media-carriers.js";
import { RefocusCommerceOperationsOnMediaDescribed } from "./operation-media-focus.js";
import { StorefrontMediaCarriers } from "./storefront-media-carriers.js";
import { RefocusStorefrontOnMediaDescribed } from "./storefront-media-focus.js";

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
 * échoue si l'un échoue (plan `documentation/commandes/boutique/boutique-rayon-layout.md`, D9).
 *
 * Depuis le 2026-10-15 (lot 2 de
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`), un
 * troisième : les opérations DU COMMERCE. Les copies du push et les
 * opérations du référentiel ne répondent plus depuis le 2026-10-17 (X1 de
 * `documentation/catalogue/catalogue-synchronise.md` §6) : l'opération vit au
 * commerce.
 *
 * `@Global` pour la raison des autres fils : le consommateur du port est
 * `media/`, qui ne peut pas importer le module qui le fournit sans devenir
 * dépendant du référentiel.
 */
@Global()
@Module({
  imports: [CatalogueModule, StorefrontModule, CommerceCatalogModule, CommerceOperationsModule],
  providers: [
    StorefrontMediaCarriers,
    CommerceOperationMediaCarriers,
    // Le point focal suit jusqu'à l'opération du commerce.
    RefocusCommerceOperationsOnMediaDescribed,
    // Depuis le 2026-10-11 (§7 bis de la médiathèque) : le point focal suit jusqu'à la vitrine, par un fait durable.
    RefocusStorefrontOnMediaDescribed,
    // L'adaptateur du référentiel vient du module qui le construit ; celui de
    // la vitrine vit ici, faute de droit `b2b → media` dans la matrice.
    {
      provide: MediaCarriers,
      useFactory: (
        pimCatalogue: PrismaMediaCarriers,
        storefront: StorefrontMediaCarriers,
        commerceOperations: CommerceOperationMediaCarriers,
      ) => new CompositeMediaCarriers([pimCatalogue, storefront, commerceOperations]),
      inject: [PrismaMediaCarriers, StorefrontMediaCarriers, CommerceOperationMediaCarriers],
    },
  ],
  exports: [MediaCarriers],
})
export class MediaCarriersModule {}
