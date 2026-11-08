import { Module } from "@nestjs/common";

import { MailCopyModule } from "../copy/mail-copy.module.js";
import { MailImagesModule } from "../images/mail-images.module.js";
import { PublishMailCharterHandler } from "./application/commands/publish-mail-charter.handler.js";
import { SaveMailCharterDraftHandler } from "./application/commands/save-mail-charter-draft.handler.js";
import { GetMailCharterHistoryHandler } from "./application/queries/get-mail-charter-history.handler.js";
import { GetMailCharterHandler } from "./application/queries/get-mail-charter.handler.js";
import { PreviewMailCharterHandler } from "./application/queries/preview-mail-charter.handler.js";
import { MailCharterLogo } from "./domain/ports/mail-charter-logo.js";
import { MailCharterPreviewRenderer } from "./domain/ports/mail-charter-preview.renderer.js";
import { MailCharterReader } from "./domain/ports/mail-charter.reader.js";
import { MailSpaceCharterRepository } from "./domain/ports/mail-space-charter.repository.js";
import { MailSpaceDirectory } from "./domain/ports/mail-space-directory.js";
import { AdminMailChartersController } from "./http/admin-mail-charters.controller.js";
import { CopierMailCharterLogo } from "./infrastructure/copier-mail-charter-logo.js";
import { PrismaMailCharterReader } from "./infrastructure/prisma-mail-charter.reader.js";
import { PrismaMailSpaceCharterRepository } from "./infrastructure/prisma-mail-space-charter.repository.js";
import { RegistryMailSpaceDirectory } from "./infrastructure/registry-mail-space-directory.js";
import { SpecimenMailCharterPreviewRenderer } from "./infrastructure/specimen-mail-charter-preview.renderer.js";

/**
 * **Les chartes des espaces d'e-mails** — la charte graphique de chaque
 * espace (`lfc`, `lfd`), son brouillon, sa publication, son historique (plan
 * `documentation/mail/plan-editeur-par-blocs.md`, § 25, C1).
 *
 * Il importe `MailCopyModule` : publier fait monter la version des textes,
 * l'estampille du cache que l'envoi lit (`CachedPublishedMailCopyReader.charters`),
 * et en oublie le cache local. Il importe `MailImagesModule` : publier copie
 * le logo dans le stockage du bloc.
 */
@Module({
  imports: [MailCopyModule, MailImagesModule],
  controllers: [AdminMailChartersController],
  providers: [
    { provide: MailSpaceCharterRepository, useClass: PrismaMailSpaceCharterRepository },
    { provide: MailCharterReader, useClass: PrismaMailCharterReader },
    { provide: MailCharterLogo, useClass: CopierMailCharterLogo },
    { provide: MailSpaceDirectory, useClass: RegistryMailSpaceDirectory },
    { provide: MailCharterPreviewRenderer, useClass: SpecimenMailCharterPreviewRenderer },
    SaveMailCharterDraftHandler,
    PublishMailCharterHandler,
    GetMailCharterHandler,
    GetMailCharterHistoryHandler,
    PreviewMailCharterHandler,
  ],
})
export class MailChartersModule {}
