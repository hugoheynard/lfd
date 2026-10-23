import { Module } from "@nestjs/common";

import { PublishMailCopyHandler } from "./application/commands/publish-mail-copy.handler.js";
import { ResetMailCopyDraftHandler } from "./application/commands/reset-mail-copy-draft.handler.js";
import { SaveMailCopyDraftHandler } from "./application/commands/save-mail-copy-draft.handler.js";
import { SendMailCopyTrialHandler } from "./application/commands/send-mail-copy-trial.handler.js";
import { GetMailCopyAdminHandler } from "./application/queries/get-mail-copy-admin.handler.js";
import { GetMailCopyPreviewHandler } from "./application/queries/get-mail-copy-preview.handler.js";
import { MailCopyAdminReader } from "./domain/ports/mail-copy-admin.reader.js";
import { MailCopyReleaseRepository } from "./domain/ports/mail-copy-release.repository.js";
import { MailCopyRepository } from "./domain/ports/mail-copy.repository.js";
import { MailSpecimenRenderer, MailTrialSender } from "./domain/ports/mail-specimen.renderer.js";
import { PublishedMailCopyCache } from "./domain/ports/published-mail-copy.cache.js";
import { MailCopyManifest } from "./domain/mail-copy-manifest.js";
import { AdminMailCopyController } from "./http/admin-mail-copy.controller.js";
import { CachedPublishedMailCopyReader } from "./infrastructure/cached-published-mail-copy.reader.js";
import { embeddedMailCopyManifest } from "./infrastructure/embedded-mail-copy-manifest.js";
import { PrismaMailCopyAdminReader } from "./infrastructure/prisma-mail-copy-admin.reader.js";
import { PrismaMailCopyReleaseRepository } from "./infrastructure/prisma-mail-copy-release.repository.js";
import { PrismaMailCopyRepository } from "./infrastructure/prisma-mail-copy.repository.js";
import { PrismaPublishedMailCopyStore } from "./infrastructure/prisma-published-mail-copy.store.js";
import { PublishedMailCopyStore } from "./infrastructure/published-mail-copy.store.js";
import { SpecimenMailPreviewRenderer } from "./infrastructure/specimen-mail-preview.renderer.js";
import { SpecimenMailTrialSender } from "./infrastructure/specimen-mail-trial.sender.js";

/**
 * **Les textes des e-mails** — des remplacements du texte du code, en
 * brouillon puis publiés (plan
 * `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`, E2).
 *
 * À côté des textes de la boutique, sous le même droit (C7). Exporte le seul
 * cache du publié : `appBootstrap/` le relie au port que le mailer déclare
 * (`MailCopySourceModule`), parce que `platform` ne voit aucun contexte.
 */
@Module({
  controllers: [AdminMailCopyController],
  providers: [
    { provide: MailCopyManifest, useFactory: embeddedMailCopyManifest },
    { provide: MailCopyRepository, useClass: PrismaMailCopyRepository },
    { provide: MailCopyReleaseRepository, useClass: PrismaMailCopyReleaseRepository },
    { provide: MailCopyAdminReader, useClass: PrismaMailCopyAdminReader },
    { provide: PublishedMailCopyStore, useClass: PrismaPublishedMailCopyStore },
    { provide: MailSpecimenRenderer, useClass: SpecimenMailPreviewRenderer },
    { provide: MailTrialSender, useClass: SpecimenMailTrialSender },
    CachedPublishedMailCopyReader,
    { provide: PublishedMailCopyCache, useExisting: CachedPublishedMailCopyReader },
    SaveMailCopyDraftHandler,
    ResetMailCopyDraftHandler,
    PublishMailCopyHandler,
    SendMailCopyTrialHandler,
    GetMailCopyAdminHandler,
    GetMailCopyPreviewHandler,
  ],
  exports: [CachedPublishedMailCopyReader],
})
export class MailCopyModule {}
