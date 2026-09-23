import { Global, Module } from "@nestjs/common";

import { MediaCarriers } from "../media/channels/carriers/media-carriers.js";
import { CatalogueModule } from "../pim/catalogue/catalogue.module.js";
import { PrismaMediaCarriers } from "../pim/catalogue/shared/infrastructure/prisma-media-carriers.js";

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
 * `@Global` pour la raison des autres fils : le consommateur du port est
 * `media/`, qui ne peut pas importer le module qui le fournit sans devenir
 * dépendant du référentiel.
 */
@Global()
@Module({
  imports: [CatalogueModule],
  // Même motif qu'`ImageCatalogueModule` : l'adaptateur vient du module qui le
  // construit, `useExisting` le désigne sous le token de l'autre bloc.
  providers: [{ provide: MediaCarriers, useExisting: PrismaMediaCarriers }],
  exports: [MediaCarriers],
})
export class MediaCarriersModule {}
