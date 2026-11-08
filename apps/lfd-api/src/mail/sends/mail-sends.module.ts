import { Module } from "@nestjs/common";

import { RevealMailRecipientHandler } from "./application/commands/reveal-mail-recipient.handler.js";
import { GetMailRecipientHandler } from "./application/queries/get-mail-recipient.handler.js";
import { GetMailSendHandler } from "./application/queries/get-mail-send.handler.js";
import { ListMailSendsHandler } from "./application/queries/list-mail-sends.handler.js";
import { SearchMailByRecipientHandler } from "./application/commands/search-mail-by-recipient.handler.js";
import { GetMailSearchResultsHandler } from "./application/queries/get-mail-search-results.handler.js";
import { MailSearchLedger } from "./domain/ports/mail-search.ledger.js";
import { MailSendFinder } from "./domain/ports/mail-send-finder.js";
import { RecipientFingerprint } from "./domain/ports/recipient-fingerprint.js";
import { HmacRecipientFingerprint } from "./infrastructure/hmac-recipient-fingerprint.js";
import { PrismaMailSearchLedger } from "./infrastructure/prisma-mail-search.ledger.js";
import { PrismaMailSendFinder } from "./infrastructure/prisma-mail-send.finder.js";
import { MailProbeTemplates } from "./domain/ports/mail-probe-templates.js";
import { MailRecipientReader } from "./domain/ports/mail-recipient.reader.js";
import { MailRevealLedger } from "./domain/ports/mail-reveal.ledger.js";
import { MailSendSubjects } from "./domain/ports/mail-send-subjects.js";
import { MailSendReader } from "./domain/ports/mail-send.reader.js";
import { StaffMailConsultationsRepository } from "./domain/ports/staff-mail-consultations.repository.js";
import { AdminMailSendsController } from "./http/admin-mail-sends.controller.js";
import { PrismaMailRecipientReader } from "./infrastructure/prisma-mail-recipient.reader.js";
import { PrismaMailRevealLedger } from "./infrastructure/prisma-mail-reveal.ledger.js";
import { PrismaMailSendSubjects } from "./infrastructure/prisma-mail-send-subjects.js";
import { PrismaMailSendReader } from "./infrastructure/prisma-mail-send.reader.js";
import { PrismaStaffMailConsultationsRepository } from "./infrastructure/prisma-staff-mail-consultations.repository.js";
import { RegistryMailProbeTemplates } from "./infrastructure/registry-mail-probe-templates.js";

/**
 * **Le suivi des e-mails** (plan `documentation/mail/plan-suivi-des-e-mails.md`,
 * lot T2) : la liste et le détail des envois sous le droit `mail_sends`,
 * l'adresse révélée sur demande, tracée et plafonnée. La purge de ses
 * consultations vit avec celle du suivi, dans `MailModule`.
 */
@Module({
  controllers: [AdminMailSendsController],
  providers: [
    { provide: MailSendReader, useClass: PrismaMailSendReader },
    { provide: MailSendSubjects, useClass: PrismaMailSendSubjects },
    { provide: MailRecipientReader, useClass: PrismaMailRecipientReader },
    { provide: MailRevealLedger, useClass: PrismaMailRevealLedger },
    { provide: StaffMailConsultationsRepository, useClass: PrismaStaffMailConsultationsRepository },
    { provide: MailProbeTemplates, useClass: RegistryMailProbeTemplates },
    { provide: MailSendFinder, useClass: PrismaMailSendFinder },
    { provide: RecipientFingerprint, useClass: HmacRecipientFingerprint },
    { provide: MailSearchLedger, useClass: PrismaMailSearchLedger },
    SearchMailByRecipientHandler,
    GetMailSearchResultsHandler,
    ListMailSendsHandler,
    GetMailSendHandler,
    GetMailRecipientHandler,
    RevealMailRecipientHandler,
  ],
})
export class MailSendsModule {}
