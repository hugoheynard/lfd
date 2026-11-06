import { Global, Module } from "@nestjs/common";

import { AppConfig } from "../platform/config/app-config.js";
import { DurableFactPayloads } from "../platform/outbox/durable-fact-payloads.js";
import { PrismaDurableFactPayloads } from "../platform/outbox/prisma-durable-fact-payloads.js";
import { MailRequests } from "./channels/requests/mail-requests.js";
import { MAIL_REQUEST_PURGE_MODE } from "./requests/domain/services/mail-request-retention.js";
import { CheckMailDeliveryHandler } from "./requests/application/check-mail-delivery.handler.js";
import { BlockMailRequests } from "./requests/application/block-mail-requests.js";
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

/**
 * **Le bloc des e-mails** (plan `documentation/editeur-de-contenu/plan-service-e-mails.md`, S1) :
 * sa porte `MailRequests`, le suivi des demandes, l'abonné durable qui
 * engage l'envoi et le fait partir après la validation, et son balayeur (S1b). Le rendu reste celui de `platform/mailer`.
 *
 * Les envoyeurs y passent bloc par bloc (S2 ; `b2b/orders` le premier, lot
 * S2a). **Global** : un bloc métier n'a le droit d'importer que le canal
 * (`mail/channels/requests/`), pas ce module — la matrice du § 3 de
 * `CLAUDE.md` dit « port uniquement ». `AppModule` l'importe une fois, et la
 * porte `MailRequests` est servie partout, comme les ports de `ContextModule`.
 */
@Global()
@Module({
  controllers: [MailRequestPurgeController, MailRequestsSweepController, MailCheckController],
  providers: [
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
    { provide: MailRequests, useClass: BlockMailRequests },
    // S1b (plan § 8) : l'envoi d'après validation et son balayeur.
    { provide: StalledMailRequests, useClass: PrismaStalledMailRequests },
    { provide: DurableFactPayloads, useClass: PrismaDurableFactPayloads },
    DeferredMailSender,
    SweepMailRequestsHandler,
    // S2h : la sonde de déploiement, sortie de `platform/mailer/`.
    CheckMailDeliveryHandler,
  ],
  exports: [MailRequests],
})
export class MailModule {}
