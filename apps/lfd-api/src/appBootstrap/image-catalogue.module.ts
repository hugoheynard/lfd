import { Global, Module } from "@nestjs/common";

import { MediaModule } from "../media/media.module.js";
import { PrismaImageCatalogue } from "../media/infrastructure/prisma-image-catalogue.js";
import { ImageCatalogue } from "../pim/channels/media/image-catalogue.js";

/**
 * **Le fil des images, relié.** Un module dont c'est le seul objet : brancher
 * le port que le référentiel déclare sur l'adaptateur que la médiathèque
 * fournit.
 *
 * Même motif et même raison que `ProductionFeedModule` : la racine de
 * composition est le seul endroit autorisé à connaître les deux côtés à la
 * fois. La matrice interdit à `pim` de voir `media` — le référentiel DÉCLARE
 * ce dont il a besoin, il ne va pas le chercher.
 *
 * `@Global` pour la raison exacte des autres fils : le consommateur du port est
 * `pim/`, qui ne peut pas importer le module qui le fournit sans devenir
 * dépendant de la médiathèque. Le token reste celui du référentiel lui-même,
 * donc rien de neuf n'est rendu atteignable.
 */
@Global()
@Module({
  imports: [MediaModule],
  // L'adaptateur vient du module de la médiathèque, qui l'EXPORTE déjà
  // construit : le reconstruire ici demanderait de lui fournir ses propres
  // dépendances, donc de connaître l'intérieur d'un bloc qu'on se contente de
  // brancher.
  providers: [{ provide: ImageCatalogue, useExisting: PrismaImageCatalogue }],
  exports: [ImageCatalogue],
})
export class ImageCatalogueModule {}
