import { Global, Module } from "@nestjs/common";

import { OperationImageLibrary } from "../lafoliecoffee/operations/channels/media/operation-image-library.js";
import { MediaOperationImageLibrary } from "./media-operation-image-library.js";

/**
 * **Le fil des images des opérations du commerce, relié** — le pendant
 * d'`ImageCatalogueModule` pour `lafoliecoffee/operations` (plan
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`, O3).
 *
 * `@Global` pour la raison des autres fils : le consommateur du port est
 * `b2b/`, qui ne peut pas importer ce qui le fournit sans dépendre de la
 * médiathèque. `ImageCatalogue`, dont l'adaptateur dépend, est global lui
 * aussi (`ImageCatalogueModule`).
 */
@Global()
@Module({
  providers: [{ provide: OperationImageLibrary, useClass: MediaOperationImageLibrary }],
  exports: [OperationImageLibrary],
})
export class OperationImageLibraryModule {}
