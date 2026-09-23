import { Module } from "@nestjs/common";

import { MediaDatabaseModule } from "./infra/database/media-database.module.js";
import { MediaIdGenerator, UuidV7MediaIds } from "./infra/id/media-id-generator.js";

import { BrowseMediaLibraryHandler } from "./application/browse-media-library.js";
import { ListMediaCarriersHandler } from "./application/list-media-carriers.js";
import { ReadUploadFailuresHandler } from "./application/read-upload-failures.js";
import { MediaFailureLog } from "./domain/ports/media-failure-log.js";
import { PrismaMediaFailureLog } from "./infrastructure/prisma-media-failure-log.js";
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
 * ✅ **Schéma, surface de base et générateur d'identifiants lui appartiennent**
 * depuis le 2026-09-23. Sa surface Prisma tient en UNE ligne — elle ne connaît
 * que ses images — là où celle du référentiel en déclare 47. Ce n'était pas un
 * détail de câblage : tant qu'elle passait par celle du PIM, elle pouvait
 * atteindre tout ce que celle-ci déclare.
 *
 * ⚠️ Ce qu'elle emprunte ENCORE, et pourquoi : le journal du référentiel
 * (`PimJournal`), le value object du texte localisé et les lecteurs de colonnes
 * JSON. Les trois sont transverses et devraient vivre dans `platform/` — le
 * `CLAUDE.md` le dit déjà du journal, « au troisième bloc émetteur », et nous y
 * sommes. Cf. `documentation/todos/todo-mediatheque.md`.
 */
@Module({
  imports: [MediaDatabaseModule],
  controllers: [MediaLibraryController, MediaSweepController],
  providers: [
    BrowseMediaLibraryHandler,
    ListMediaCarriersHandler,
    ReadUploadFailuresHandler,
    { provide: MediaFailureLog, useClass: PrismaMediaFailureLog },
    SaveMediaDetailsHandler,
    DiscardMediaHandler,
    DepositImageHandler,
    SweepOrphanMediaHandler,
    { provide: MediaIdGenerator, useClass: UuidV7MediaIds },
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
