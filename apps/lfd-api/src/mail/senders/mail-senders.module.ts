import { Module } from "@nestjs/common";

import { MailCopyModule } from "../copy/mail-copy.module.js";
import { ChangeMailSenderHandler } from "./application/commands/change-mail-sender.handler.js";
import { GetMailSenderHandler } from "./application/queries/get-mail-sender.handler.js";
import { MailSenderReader } from "./domain/ports/mail-sender.reader.js";
import { MailSenderTrial } from "./domain/ports/mail-sender-trial.js";
import { MailSpaceSenderRepository } from "./domain/ports/mail-space-sender.repository.js";
import { VerifiedSendingDomains } from "./domain/ports/verified-sending-domains.js";
import { AdminMailSendersController } from "./http/admin-mail-senders.controller.js";
import { MailPortSenderTrial } from "./infrastructure/mail-port-sender-trial.js";
import { MailSenderBootReport } from "./infrastructure/mail-sender-boot-report.js";
import { PrismaMailSenderReader } from "./infrastructure/prisma-mail-sender.reader.js";
import { PrismaMailSpaceSenderRepository } from "./infrastructure/prisma-mail-space-sender.repository.js";
import { ResendVerifiedSendingDomains } from "./infrastructure/resend-verified-sending-domains.js";

/**
 * **Les identités d'envoi des espaces d'e-mails** — nom d'expéditeur, adresse
 * d'envoi, adresse de réponse de chaque espace (`lfc`, `lfd`), rangés en base
 * (plan `documentation/editeur-de-contenu/plan-editeur-par-blocs.md`, § 25,
 * C3). Un geste distinct de la charte : sa commande, son fait.
 *
 * Il importe `MailCopyModule` : changer une identité fait monter la version
 * des textes, l'estampille du cache que l'envoi lit
 * (`CachedPublishedMailCopyReader.senders`), et en oublie le cache local.
 */
@Module({
  imports: [MailCopyModule],
  controllers: [AdminMailSendersController],
  providers: [
    { provide: MailSpaceSenderRepository, useClass: PrismaMailSpaceSenderRepository },
    { provide: MailSenderReader, useClass: PrismaMailSenderReader },
    { provide: VerifiedSendingDomains, useClass: ResendVerifiedSendingDomains },
    { provide: MailSenderTrial, useClass: MailPortSenderTrial },
    MailSenderBootReport,
    ChangeMailSenderHandler,
    GetMailSenderHandler,
  ],
})
export class MailSendersModule {}
