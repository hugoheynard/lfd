import { Module } from "@nestjs/common";

import { PimDatabaseModule } from "../pim/infra/database/pim-database.module.js";
import { PimIdGenerator, UuidV7Generator } from "../pim/infra/id/pim-id-generator.js";

import { BrowseMediaLibraryHandler } from "./application/browse-media-library.js";
import { DepositImageHandler } from "./application/deposit-image.js";
import { DiscardMediaHandler } from "./application/discard-media.js";
import { SaveMediaDetailsHandler } from "./application/save-media-details.js";
import { SweepOrphanMediaHandler } from "./application/sweep-orphan-media.js";
import { MediaLibrary } from "./domain/ports/media-library.js";
import { MediaLibraryReader } from "./domain/ports/media-library-reader.js";
import { MediaLibraryWriter } from "./domain/ports/media-library-writer.js";
import { MediaLibraryController } from "./http/media-library.controller.js";
import { MediaSweepController } from "./http/media-sweep.controller.js";
import { PrismaImageCatalogue } from "./infrastructure/prisma-image-catalogue.js";
import { PrismaMediaLibrary } from "./infrastructure/prisma-media-library.js";
import { PrismaMediaLibraryReader } from "./infrastructure/prisma-media-library-reader.js";
import { PrismaMediaLibraryWriter } from "./infrastructure/prisma-media-library-writer.js";

/**
 * **LA MÉDIATHÈQUE** — le fonds d'images, indépendamment de ce qui l'affiche.
 *
 * 🔴 Un bloc à elle, et pas un dossier du référentiel : les fiches portent des
 * visuels, les familles aussi (`CategoryMedia`), et les contenus de la vitrine
 * en porteront. Aucun d'eux ne possède la bibliothèque — le domaine le disait
 * déjà le jour où ses value-objects sont sortis de `product/` : « ni l'un ni
 * l'autre ne possède la bibliothèque ».
 *
 * Ce qui a rendu la séparation possible, et dans cet ordre : une image, une
 * ligne ; plus de visuel par simple URL ; les lectures par l'URL ; l'étiquette
 * et l'alternative hors de la fiche ; enfin le port `ImageCatalogue`. Tant que
 * le référentiel ÉCRIVAIT la bibliothèque, `lint:prisma-model-ownership` lui
 * en donnait la propriété, et le dossier ne pouvait pas bouger.
 *
 * ⚠️ Il emprunte encore `PimDatabaseModule` : la table vit dans le schéma
 * `pim`, et l'y déplacer est le déploiement ③
 * (`documentation/mediatheque/plan-la-mediatheque-bloc-a-part.md`). Le schéma
 * ne tenait pas la propriété — c'est l'écriture qui la tenait.
 */
@Module({
  imports: [PimDatabaseModule],
  controllers: [MediaLibraryController, MediaSweepController],
  providers: [
    BrowseMediaLibraryHandler,
    SaveMediaDetailsHandler,
    DiscardMediaHandler,
    DepositImageHandler,
    SweepOrphanMediaHandler,
    // ⚠️ Le générateur d'identifiants est encore emprunté au référentiel : la
    // bibliothèque range ses lignes dans le schéma `pim`, et son inscription
    // porte un ULID du même atelier. Il déménagera avec le schéma (③).
    { provide: PimIdGenerator, useClass: UuidV7Generator },
    { provide: MediaLibrary, useClass: PrismaMediaLibrary },
    { provide: MediaLibraryReader, useClass: PrismaMediaLibraryReader },
    { provide: MediaLibraryWriter, useClass: PrismaMediaLibraryWriter },
    PrismaImageCatalogue,
  ],
  // L'adaptateur du canal est EXPORTÉ, pas fourni sous son token : c'est la
  // racine de composition qui les relie (`ImageCatalogueModule`), parce qu'elle
  // est le seul endroit autorisé à connaître les deux côtés.
  exports: [MediaLibrary, PrismaImageCatalogue],
})
export class MediaModule {}
