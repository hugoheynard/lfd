import { Global, Module } from "@nestjs/common";

import { AppConfig } from "../platform/config/app-config.js";
import { DurableFactPayloads } from "../platform/outbox/durable-fact-payloads.js";
import { PrismaDurableFactPayloads } from "../platform/outbox/prisma-durable-fact-payloads.js";
import { Mail } from "./channels/requests/mail.js";
import { MAIL_REQUEST_PURGE_MODE } from "./requests/domain/services/mail-request-retention.js";
import { CheckMailDeliveryHandler } from "./requests/application/check-mail-delivery.handler.js";
import { BlockMail } from "./requests/application/block-mail.js";
import { DeferredMailSender } from "./requests/application/deferred-mail-sender.service.js";
import { DeliverRequestedMail } from "./requests/application/deliver-requested-mail.handler.js";
import { ImmediateMailSender } from "./requests/application/immediate-mail-sender.service.js";
import { MailRequester } from "./requests/application/mail-requester.service.js";
import { MailAttachments } from "./requests/application/mail-attachments.js";
import { MailSendAttempt } from "./requests/application/mail-send-attempt.js";
import { PurgeSettledMailRequestsHandler } from "./requests/application/purge-settled-mail-requests.handler.js";
import { SweepMailRequestsHandler } from "./requests/application/sweep-mail-requests.handler.js";
import { MailAttachmentStore } from "./requests/domain/ports/mail-attachment.store.js";
import { MailDispatch } from "./requests/domain/ports/mail-dispatch.js";
import { MailRequestPruner } from "./requests/domain/ports/mail-request.pruner.js";
import { MailRequestRepository } from "./requests/domain/ports/mail-request.repository.js";
import { MailCheckController } from "./requests/http/mail-check.controller.js";
import { MailRequestPurgeController } from "./requests/http/mail-request-purge.controller.js";
import { StalledMailRequests } from "./requests/domain/ports/stalled-mail-requests.js";
import { MailRequestsSweepController } from "./requests/http/mail-requests-sweep.controller.js";
import { UnitOfWorkProbe } from "./requests/domain/ports/unit-of-work-probe.js";
import { AmbientUnitOfWorkProbe } from "./requests/infrastructure/ambient-unit-of-work-probe.js";
import { MailerMailDispatch } from "./requests/infrastructure/mailer-mail-dispatch.js";
import { PrismaMailRequestPruner } from "./requests/infrastructure/prisma-mail-request.pruner.js";
import { PrismaMailRequestRepository } from "./requests/infrastructure/prisma-mail-request.repository.js";
import { PrismaStalledMailRequests } from "./requests/infrastructure/prisma-stalled-mail-requests.js";
import { StorageMailAttachmentStore } from "./requests/infrastructure/storage-mail-attachment.store.js";
import { MAIL_TRANSPORT_PROVIDERS } from "./templates/mail-transport.providers.js";
import { MailTemplatePreview } from "./channels/templates/mail-template-preview.js";
import { ShortfallLetterDrafter } from "./channels/templates/shortfall-letter-drafter.js";
import { PublishedShortfallLetterDrafter } from "./templates/published-shortfall-letter-drafter.js";
import { MAIL_IMAGE_ORIGINS_VARIABLE } from "../platform/config/mail-image-readers.js";
import {
  MAIL_IMAGE_ADMISSION,
  type MailImageAdmission,
} from "./images/application/mail-image-admission.js";
import { MailImageCopier } from "./images/application/mail-image-copier.service.js";
import { MailImageDownloader } from "./images/domain/ports/mail-image.downloader.js";
import { MailImageStore } from "./images/domain/ports/mail-image.store.js";
import { FetchMailImageDownloader } from "./images/infrastructure/fetch-mail-image.downloader.js";
import { R2MailImageStore } from "./images/infrastructure/r2-mail-image.store.js";
import { RegistryMailTemplatePreview } from "./templates/registry-mail-template-preview.js";

/**
 * **Le bloc des e-mails** (plan `documentation/editeur-de-contenu/plan-service-e-mails.md`, S1) :
 * sa porte `Mail`, le suivi des demandes, l'abonné durable qui
 * engage l'envoi et le fait partir après la validation, et son balayeur (S1b).
 * Depuis S3b, le rendu aussi : les gabarits, le dictionnaire, le texte
 * effectif et le mailer qui les charge (`mail/templates/`).
 *
 * Les envoyeurs y passent bloc par bloc (S2 ; `b2b/orders` le premier, lot
 * S2a). **Global** : un bloc métier n'a le droit d'importer que le canal
 * (`mail/channels/requests/`), pas ce module — la matrice du § 3 de
 * `CLAUDE.md` dit « port uniquement ». `AppModule` l'importe une fois, et la
 * porte `Mail` est servie partout, comme les ports de `ContextModule`.
 */
@Global()
@Module({
  controllers: [MailRequestPurgeController, MailRequestsSweepController, MailCheckController],
  providers: [
    // S3b : le mailer (transport, texte effectif, journal), sorti de
    // `platform/mailer/` avec les gabarits qu'il charge.
    ...MAIL_TRANSPORT_PROVIDERS,
    { provide: MailRequestPruner, useClass: PrismaMailRequestPruner },
    {
      provide: MAIL_REQUEST_PURGE_MODE,
      useFactory: (config: AppConfig) => config.mailRequestPurgeMode(),
      inject: [AppConfig],
    },
    PurgeSettledMailRequestsHandler,
    { provide: MailRequestRepository, useClass: PrismaMailRequestRepository },
    { provide: MailDispatch, useClass: MailerMailDispatch },
    { provide: UnitOfWorkProbe, useClass: AmbientUnitOfWorkProbe },
    // S2a : les pièces jointes relues au stockage, à chaque essai.
    { provide: MailAttachmentStore, useClass: StorageMailAttachmentStore },
    MailAttachments,
    MailSendAttempt,
    MailRequester,
    ImmediateMailSender,
    DeliverRequestedMail,
    { provide: Mail, useClass: BlockMail },
    // S1b (plan § 8) : l'envoi d'après validation et son balayeur.
    { provide: StalledMailRequests, useClass: PrismaStalledMailRequests },
    { provide: DurableFactPayloads, useClass: PrismaDurableFactPayloads },
    DeferredMailSender,
    SweepMailRequestsHandler,
    // S2h : la sonde de déploiement, sortie de `platform/mailer/`.
    CheckMailDeliveryHandler,
    // S3b : les deux comportements des gabarits que des blocs métier
    // demandent, par le canal `mail/channels/templates/`.
    { provide: MailTemplatePreview, useClass: RegistryMailTemplatePreview },
    { provide: ShortfallLetterDrafter, useClass: PublishedShortfallLetterDrafter },
    // S3d (plan § 24) : la copie des images des modèles dans le stockage du
    // bloc. Personne ne l'appelle encore ; S4 la branchera à la publication.
    {
      provide: MAIL_IMAGE_ADMISSION,
      useFactory: (config: AppConfig): MailImageAdmission => ({
        origins: config.mailImageOrigins(),
        originsVariable: MAIL_IMAGE_ORIGINS_VARIABLE,
      }),
      inject: [AppConfig],
    },
    { provide: MailImageDownloader, useClass: FetchMailImageDownloader },
    { provide: MailImageStore, useClass: R2MailImageStore },
    MailImageCopier,
  ],
  exports: [Mail, MailTemplatePreview, ShortfallLetterDrafter],
})
export class MailModule {}
