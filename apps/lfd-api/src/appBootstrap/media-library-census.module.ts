import { Global, Module } from "@nestjs/common";

import { MediaDatabaseModule } from "../media/infra/database/media-database.module.js";
import { PrismaMediaLibraryCensus } from "../media/infrastructure/prisma-media-library-census.js";
import { MediaLibraryCensus } from "../platform/storage/media-library-census.js";

/**
 * **Le recensement de la médiathèque, relié.** Un module dont c'est le seul
 * objet : brancher le port que la couche technique déclare sur l'adaptateur de
 * la médiathèque, pour que la carte OPS compte le fonds sans le lire.
 *
 * Même forme que `StaffAccessModule` : le consommateur est `ops/`, qui ne peut
 * importer aucun bloc métier, et la médiathèque ne peut pas importer `ops`.
 * Seule la racine de composition voit les deux côtés.
 *
 * `useClass` et non `useExisting` comme `ImageCatalogueModule` : l'adaptateur
 * est sans état, et ne dépend que de la surface Prisma que la médiathèque
 * exporte déjà — l'exporter de `MediaModule` n'apporterait rien.
 *
 * `@Global` : le port est injecté par le module d'`ops`, qui ne peut pas
 * importer celui-ci.
 */
@Global()
@Module({
  imports: [MediaDatabaseModule],
  providers: [{ provide: MediaLibraryCensus, useClass: PrismaMediaLibraryCensus }],
  exports: [MediaLibraryCensus],
})
export class MediaLibraryCensusModule {}
