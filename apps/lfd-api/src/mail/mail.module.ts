import { Module } from "@nestjs/common";

import { AppConfig } from "../platform/config/app-config.js";
import { MailRequests } from "./channels/requests/mail-requests.js";
import { MAIL_REQUEST_PURGE_MODE } from "./requests/domain/services/mail-request-retention.js";
import { BlockMailRequests } from "./requests/application/block-mail-requests.js";
import { DeliverRequestedMail } from "./requests/application/deliver-requested-mail.handler.js";
import { ImmediateMailSender } from "./requests/application/immediate-mail-sender.service.js";
import { MailRequester } from "./requests/application/mail-requester.service.js";
import { MailSendAttempt } from "./requests/application/mail-send-attempt.js";
import { PurgeSettledMailRequestsHandler } from "./requests/application/purge-settled-mail-requests.handler.js";
import { MailDispatch } from "./requests/domain/ports/mail-dispatch.js";
import { MailRequestPruner } from "./requests/domain/ports/mail-request.pruner.js";
import { MailRequestRepository } from "./requests/domain/ports/mail-request.repository.js";
import { MailRequestPurgeController } from "./requests/http/mail-request-purge.controller.js";
import { UnitOfWorkProbe } from "./requests/domain/ports/unit-of-work-probe.js";
import { AmbientUnitOfWorkProbe } from "./requests/infrastructure/ambient-unit-of-work-probe.js";
import { MailerMailDispatch } from "./requests/infrastructure/mailer-mail-dispatch.js";
import { PrismaMailRequestPruner } from "./requests/infrastructure/prisma-mail-request.pruner.js";
import { PrismaMailRequestRepository } from "./requests/infrastructure/prisma-mail-request.repository.js";

/**
 * **Le bloc des e-mails** (plan `documentation/editeur-de-contenu/plan-service-e-mails.md`, S1) :
 * sa porte `MailRequests`, le suivi des demandes, et l'abonné durable qui
 * envoie après la validation. Le rendu reste celui de `platform/mailer`.
 *
 * Au 2026-11-06, aucun envoyeur ne passe encore par la porte : S2 les fera
 * migrer, bloc par bloc, et décidera comment la porte leur est servie.
 */
@Module({
  controllers: [MailRequestPurgeController],
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
    MailSendAttempt,
    MailRequester,
    ImmediateMailSender,
    DeliverRequestedMail,
    { provide: MailRequests, useClass: BlockMailRequests },
  ],
  exports: [MailRequests],
})
export class MailModule {}
