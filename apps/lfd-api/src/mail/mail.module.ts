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
import { MailNatures } from "./requests/domain/ports/mail-natures.js";
import { MailRequestPruner } from "./requests/domain/ports/mail-request.pruner.js";
import { MailRequestRepository } from "./requests/domain/ports/mail-request.repository.js";
import { MailCheckController } from "./requests/http/mail-check.controller.js";
import { MailRequestPurgeController } from "./requests/http/mail-request-purge.controller.js";
import { StalledMailRequests } from "./requests/domain/ports/stalled-mail-requests.js";
import { MailRequestsSweepController } from "./requests/http/mail-requests-sweep.controller.js";
import { MailRequestsWatchController } from "./requests/http/mail-requests-watch.controller.js";
import { WatchMailRequestsHandler } from "./requests/application/watch-mail-requests.handler.js";
import { BlockMailBacklogSurvey } from "./requests/application/block-mail-backlog-survey.js";
import { DeferredMailCheck } from "./requests/application/deferred-mail-check.service.js";
import { MailBacklogReader } from "./requests/domain/ports/mail-backlog.reader.js";
import { Pause } from "./requests/domain/ports/pause.js";
import { PrismaMailBacklogReader } from "./requests/infrastructure/prisma-mail-backlog.reader.js";
import { BlockMailDeliveryTally } from "./requests/application/block-mail-delivery-tally.js";
import { MailDeliveryCountsReader } from "./requests/domain/ports/mail-delivery-counts.reader.js";
import { PrismaMailDeliveryCountsReader } from "./requests/infrastructure/prisma-mail-delivery-counts.reader.js";
import { MailProbeTemplates } from "./sends/domain/ports/mail-probe-templates.js";
import { RegistryMailProbeTemplates } from "./sends/infrastructure/registry-mail-probe-templates.js";
import { TimerPause } from "./requests/infrastructure/timer-pause.js";
import { MailBacklogSurvey } from "./channels/requests/mail-backlog-survey.js";
import { UnitOfWorkProbe } from "./requests/domain/ports/unit-of-work-probe.js";
import { AmbientUnitOfWorkProbe } from "./requests/infrastructure/ambient-unit-of-work-probe.js";
import { MailerMailDispatch } from "./requests/infrastructure/mailer-mail-dispatch.js";
import { RegistryMailNatures } from "./requests/infrastructure/registry-mail-natures.js";
import { PrismaMailRequestPruner } from "./requests/infrastructure/prisma-mail-request.pruner.js";
import { PrismaMailRequestRepository } from "./requests/infrastructure/prisma-mail-request.repository.js";
import { PrismaStalledMailRequests } from "./requests/infrastructure/prisma-stalled-mail-requests.js";
import { StorageMailAttachmentStore } from "./requests/infrastructure/storage-mail-attachment.store.js";
import { MAIL_TRANSPORT_PROVIDERS } from "./templates/mail-transport.providers.js";
import { MailTemplatePreview } from "./channels/templates/mail-template-preview.js";
import { ShortfallLetterDrafter } from "./channels/templates/shortfall-letter-drafter.js";
import { PublishedShortfallLetterDrafter } from "./templates/published-shortfall-letter-drafter.js";
import { RegistryMailTemplatePreview } from "./templates/registry-mail-template-preview.js";
import { ReceiveResendEventHandler } from "./deliveries/application/receive-resend-event.handler.js";
import { MailDeliveryEventLog } from "./deliveries/domain/ports/mail-delivery-event.log.js";
import { OrphanMailDeliveryPruner } from "./deliveries/domain/ports/orphan-mail-delivery.pruner.js";
import { ResendWebhookController } from "./deliveries/http/resend-webhook.controller.js";
import { PrismaMailDeliveryEventLog } from "./deliveries/infrastructure/prisma-mail-delivery-event.log.js";
import { PrismaOrphanMailDeliveryPruner } from "./deliveries/infrastructure/prisma-orphan-mail-delivery.pruner.js";
import { PrismaRecordedMailDeliveries } from "./deliveries/infrastructure/prisma-recorded-mail-deliveries.js";
import { PrismaUnappliedMailDeliveries } from "./deliveries/infrastructure/prisma-unapplied-mail-deliveries.js";
import { MailConsultationPruner } from "./sends/domain/ports/mail-consultation.pruner.js";
import { PrismaMailConsultationPruner } from "./sends/infrastructure/prisma-mail-consultation.pruner.js";
import { MailSubjectDeliveries } from "./channels/deliveries/mail-subject-deliveries.js";
import { PrismaMailSubjectDeliveries } from "./sends/infrastructure/prisma-mail-subject-deliveries.js";
import { MailDeliveryApplier } from "./requests/application/mail-delivery-applier.js";
import { MailOutcomeRecorder } from "./requests/application/mail-outcome-recorder.js";
import { RecordedMailDeliveries } from "./requests/domain/ports/recorded-mail-deliveries.js";
import { UnappliedMailDeliveries } from "./requests/domain/ports/unapplied-mail-deliveries.js";

/**
 * **Le bloc des e-mails** (plan `documentation/mail/plan-service-e-mails.md`, S1) :
 * sa porte `Mail`, le suivi des demandes, l'abonné durable qui
 * engage l'envoi et le fait partir après la validation, et son balayeur (S1b).
 * Depuis S3b, le rendu aussi : les gabarits, le dictionnaire, le texte
 * effectif et le mailer qui les charge (`mail/templates/`).
 *
 * Les envoyeurs y passent bloc par bloc (S2 ; `lafoliecoffee/orders` le premier, lot
 * S2a). **Global** : un bloc métier n'a le droit d'importer que le canal
 * (`mail/channels/requests/`), pas ce module — la matrice du § 3 de
 * `CLAUDE.md` dit « port uniquement ». `AppModule` l'importe une fois, et la
 * porte `Mail` est servie partout, comme les ports de `ContextModule`.
 */
@Global()
@Module({
  controllers: [
    MailRequestPurgeController,
    MailRequestsSweepController,
    MailRequestsWatchController,
    MailCheckController,
    // T1 du suivi (`le-suivi-des-e-mails.md`) : le webhook Resend,
    // sorti de `platform/mailer/`, range et applique les retours.
    ResendWebhookController,
  ],
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
    // U3 du plan de désinscription : la nature des modèles, lue par le
    // contrôle marketing (`MarketingClearance`, servi par `MailMarketingModule`).
    { provide: MailNatures, useClass: RegistryMailNatures },
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
    // S8 (plan § 25) : la sonde éprouve aussi l'envoi différé ; la veille
    // sonne la cloche ; la carte de santé lit ses relevés par le canal.
    { provide: Pause, useClass: TimerPause },
    DeferredMailCheck,
    { provide: MailBacklogReader, useClass: PrismaMailBacklogReader },
    WatchMailRequestsHandler,
    { provide: MailBacklogSurvey, useClass: BlockMailBacklogSurvey },
    // T1b du suivi : les retours comptés, pour la veille (rebonds) et pour la
    // carte de santé, que `appBootstrap/` relie au port de `platform/`.
    { provide: MailDeliveryCountsReader, useClass: PrismaMailDeliveryCountsReader },
    { provide: MailProbeTemplates, useClass: RegistryMailProbeTemplates },
    BlockMailDeliveryTally,
    // S3b : les deux comportements des gabarits que des blocs métier
    // demandent, par le canal `mail/channels/templates/`.
    { provide: MailTemplatePreview, useClass: RegistryMailTemplatePreview },
    { provide: ShortfallLetterDrafter, useClass: PublishedShortfallLetterDrafter },
    // T1 du suivi des e-mails : les retours de Resend rangés, puis appliqués
    // à la pose de l'identifiant, par le webhook ou par le balayeur.
    { provide: MailDeliveryEventLog, useClass: PrismaMailDeliveryEventLog },
    { provide: RecordedMailDeliveries, useClass: PrismaRecordedMailDeliveries },
    { provide: UnappliedMailDeliveries, useClass: PrismaUnappliedMailDeliveries },
    { provide: OrphanMailDeliveryPruner, useClass: PrismaOrphanMailDeliveryPruner },
    // T2 : les consultations du suivi, purgées sous le même cran.
    { provide: MailConsultationPruner, useClass: PrismaMailConsultationPruner },
    MailOutcomeRecorder,
    MailDeliveryApplier,
    ReceiveResendEventHandler,
    // Le sujet des e-mails (`le-sujet-des-e-mails.md`, E2) : les e-mails
    // d'un objet, lus par les blocs métier par le canal.
    { provide: MailSubjectDeliveries, useClass: PrismaMailSubjectDeliveries },
  ],
  exports: [
    MailNatures,
    MailSubjectDeliveries,
    Mail,
    MailTemplatePreview,
    ShortfallLetterDrafter,
    MailBacklogSurvey,
    BlockMailDeliveryTally,
  ],
})
export class MailModule {}
