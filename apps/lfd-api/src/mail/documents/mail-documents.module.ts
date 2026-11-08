import { Module } from "@nestjs/common";

import { MailCopyModule } from "../copy/mail-copy.module.js";
import { MailImagesModule } from "../images/mail-images.module.js";
import { PublishMailDocumentHandler } from "./application/commands/publish-mail-document.handler.js";
import { RevertMailDocumentHandler } from "./application/commands/revert-mail-document.handler.js";
import { SendMailDocumentTrialHandler } from "./application/commands/send-mail-document-trial.handler.js";
import { SaveMailDocumentDraftHandler } from "./application/commands/save-mail-document-draft.handler.js";
import { GetMailDocumentHistoryHandler } from "./application/queries/get-mail-document-history.handler.js";
import { GetMailTemplatePhrasesHandler } from "./application/queries/get-mail-template-phrases.handler.js";
import { GetMailTemplateHandler } from "./application/queries/get-mail-template.handler.js";
import { ListMailTemplatesHandler } from "./application/queries/list-mail-templates.handler.js";
import { PreviewMailDocumentBlocksHandler } from "./application/queries/preview-mail-document-blocks.handler.js";
import { PreviewMailDocumentHandler } from "./application/queries/preview-mail-document.handler.js";
import { MailDocumentImages } from "./domain/ports/mail-document-images.js";
import { MailBlockPreviewRenderer } from "./domain/ports/mail-block-preview.renderer.js";
import { MailDocumentReader } from "./domain/ports/mail-document.reader.js";
import { MailDocumentPreviewRenderer } from "./domain/ports/mail-document-preview.renderer.js";
import { MailTemplateCatalogue } from "./domain/ports/mail-template-catalogue.js";
import { MailTemplateDocumentRepository } from "./domain/ports/mail-template-document.repository.js";
import { AdminMailTemplatePhrasesController } from "./http/admin-mail-template-phrases.controller.js";
import { AdminMailTemplatesController } from "./http/admin-mail-templates.controller.js";
import { CopierMailDocumentImages } from "./infrastructure/copier-mail-document-images.js";
import { PrismaMailDocumentReader } from "./infrastructure/prisma-mail-document.reader.js";
import { PrismaMailTemplateDocumentRepository } from "./infrastructure/prisma-mail-template-document.repository.js";
import { RegistryMailTemplateCatalogue } from "./infrastructure/registry-mail-template-catalogue.js";
import { SpecimenMailBlockPreviewRenderer } from "./infrastructure/specimen-mail-block-preview.renderer.js";
import { SpecimenMailDocumentPreviewRenderer } from "./infrastructure/specimen-mail-document-preview.renderer.js";

/**
 * **Les documents des e-mails** — l'arrangement de chaque e-mail par blocs,
 * son brouillon, sa publication, son retour au modèle d'origine (plan
 * `documentation/mail/plan-editeur-par-blocs.md`, S4c).
 *
 * Il importe `MailCopyModule` : « Publier » publie l'arrangement et les
 * phrases dans la même transaction, sous la même version, et oublie le même
 * cache. Il importe `MailImagesModule` : publier copie les images du
 * document dans le stockage du bloc (S5d). L'envoi, lui, lit les documents publiés par ce cache
 * (`CachedPublishedMailCopyReader.documents`).
 */
@Module({
  imports: [MailCopyModule, MailImagesModule],
  controllers: [AdminMailTemplatesController, AdminMailTemplatePhrasesController],
  providers: [
    { provide: MailTemplateDocumentRepository, useClass: PrismaMailTemplateDocumentRepository },
    { provide: MailDocumentReader, useClass: PrismaMailDocumentReader },
    { provide: MailTemplateCatalogue, useClass: RegistryMailTemplateCatalogue },
    { provide: MailDocumentPreviewRenderer, useClass: SpecimenMailDocumentPreviewRenderer },
    // S5f : le canevas, rendu bloc par bloc, phrases et variables marquées.
    { provide: MailBlockPreviewRenderer, useClass: SpecimenMailBlockPreviewRenderer },
    // S5d : les images d'un document se copient à sa publication.
    { provide: MailDocumentImages, useClass: CopierMailDocumentImages },
    SaveMailDocumentDraftHandler,
    PublishMailDocumentHandler,
    RevertMailDocumentHandler,
    SendMailDocumentTrialHandler,
    ListMailTemplatesHandler,
    GetMailTemplateHandler,
    GetMailTemplatePhrasesHandler,
    GetMailDocumentHistoryHandler,
    PreviewMailDocumentHandler,
    PreviewMailDocumentBlocksHandler,
  ],
})
export class MailDocumentsModule {}
