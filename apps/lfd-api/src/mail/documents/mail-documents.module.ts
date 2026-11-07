import { Module } from "@nestjs/common";

import { MailCopyModule } from "../copy/mail-copy.module.js";
import { PublishMailDocumentHandler } from "./application/commands/publish-mail-document.handler.js";
import { RevertMailDocumentHandler } from "./application/commands/revert-mail-document.handler.js";
import { SaveMailDocumentDraftHandler } from "./application/commands/save-mail-document-draft.handler.js";
import { GetMailDocumentHistoryHandler } from "./application/queries/get-mail-document-history.handler.js";
import { GetMailTemplateHandler } from "./application/queries/get-mail-template.handler.js";
import { ListMailTemplatesHandler } from "./application/queries/list-mail-templates.handler.js";
import { PreviewMailDocumentHandler } from "./application/queries/preview-mail-document.handler.js";
import { MailDocumentReader } from "./domain/ports/mail-document.reader.js";
import { MailDocumentPreviewRenderer } from "./domain/ports/mail-document-preview.renderer.js";
import { MailTemplateCatalogue } from "./domain/ports/mail-template-catalogue.js";
import { MailTemplateDocumentRepository } from "./domain/ports/mail-template-document.repository.js";
import { AdminMailTemplatesController } from "./http/admin-mail-templates.controller.js";
import { PrismaMailDocumentReader } from "./infrastructure/prisma-mail-document.reader.js";
import { PrismaMailTemplateDocumentRepository } from "./infrastructure/prisma-mail-template-document.repository.js";
import { RegistryMailTemplateCatalogue } from "./infrastructure/registry-mail-template-catalogue.js";
import { SpecimenMailDocumentPreviewRenderer } from "./infrastructure/specimen-mail-document-preview.renderer.js";

/**
 * **Les documents des e-mails** — l'arrangement de chaque e-mail par blocs,
 * son brouillon, sa publication, son retour au modèle d'origine (plan
 * `documentation/editeur-de-contenu/plan-editeur-par-blocs.md`, S4c).
 *
 * Il importe `MailCopyModule` : « Publier » publie l'arrangement et les
 * phrases dans la même transaction, sous la même version, et oublie le même
 * cache. L'envoi, lui, lit les documents publiés par ce cache
 * (`CachedPublishedMailCopyReader.documents`).
 */
@Module({
  imports: [MailCopyModule],
  controllers: [AdminMailTemplatesController],
  providers: [
    { provide: MailTemplateDocumentRepository, useClass: PrismaMailTemplateDocumentRepository },
    { provide: MailDocumentReader, useClass: PrismaMailDocumentReader },
    { provide: MailTemplateCatalogue, useClass: RegistryMailTemplateCatalogue },
    { provide: MailDocumentPreviewRenderer, useClass: SpecimenMailDocumentPreviewRenderer },
    SaveMailDocumentDraftHandler,
    PublishMailDocumentHandler,
    RevertMailDocumentHandler,
    ListMailTemplatesHandler,
    GetMailTemplateHandler,
    GetMailDocumentHistoryHandler,
    PreviewMailDocumentHandler,
  ],
})
export class MailDocumentsModule {}
