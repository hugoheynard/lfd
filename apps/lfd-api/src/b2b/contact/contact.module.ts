import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { ArchiveContactPhoneHandler } from "./application/commands/archive-contact-phone.handler.js";
import { CreateContactPhoneHandler } from "./application/commands/create-contact-phone.handler.js";
import { ReviseContactPhoneHandler } from "./application/commands/revise-contact-phone.handler.js";
import { GetPublicContactSettingsHandler } from "./application/queries/get-public-contact-settings.handler.js";
import { ListContactPhonesHandler } from "./application/queries/list-contact-phones.handler.js";
import { ContactPhoneReader } from "./domain/ports/contact-phone.reader.js";
import { ContactPhoneRepository } from "./domain/ports/contact-phone.repository.js";
import { AdminContactPhonesController } from "./http/admin-contact-phones.controller.js";
import {
  PrismaContactPhoneReader,
  PrismaContactPhoneRepository,
} from "./infrastructure/prisma-contact-phones.js";
import { AnonymizeHandledContactMessagesHandler } from "./application/commands/anonymize-handled-contact-messages.handler.js";
import { ArchiveContactSubjectHandler } from "./application/commands/archive-contact-subject.handler.js";
import { CreateContactSubjectHandler } from "./application/commands/create-contact-subject.handler.js";
import { MarkContactMessageHandledHandler } from "./application/commands/mark-contact-message-handled.handler.js";
import { ReviseContactSubjectHandler } from "./application/commands/revise-contact-subject.handler.js";
import { SendContactMessageHandler } from "./application/commands/send-contact-message.handler.js";
import { UpdateContactSettingsHandler } from "./application/commands/update-contact-settings.handler.js";
import { MailContactMessage } from "./application/handlers/mail-contact-message.handler.js";
import { RingContactMessageReceived } from "./application/handlers/ring-contact-message-received.handler.js";
import { GetContactSettingsHandler } from "./application/queries/get-contact-settings.handler.js";
import { ListContactMessagesHandler } from "./application/queries/list-contact-messages.handler.js";
import { ListContactSubjectsHandler } from "./application/queries/list-contact-subjects.handler.js";
import { ListOfferedContactSubjectsHandler } from "./application/queries/list-offered-contact-subjects.handler.js";
import { ContactMessageAnonymizer } from "./domain/ports/contact-message.anonymizer.js";
import { ContactMessageReader } from "./domain/ports/contact-message.reader.js";
import { ContactMessageRepository } from "./domain/ports/contact-message.repository.js";
import { ContactSettingsReader } from "./domain/ports/contact-settings.reader.js";
import { ContactSettingsRepository } from "./domain/ports/contact-settings.repository.js";
import { ContactSubjectReader } from "./domain/ports/contact-subject.reader.js";
import { ContactSubjectRepository } from "./domain/ports/contact-subject.repository.js";
import { AdminContactMessagesController } from "./http/admin-contact-messages.controller.js";
import { AdminContactSettingsController } from "./http/admin-contact-settings.controller.js";
import { AdminContactSubjectsController } from "./http/admin-contact-subjects.controller.js";
import { ContactAnonymizationSweepController } from "./http/contact-anonymization-sweep.controller.js";
import { ContactMessagesController } from "./http/contact-messages.controller.js";
import { ContactController } from "./http/contact.controller.js";
import { MyContactMessagesController } from "./http/my-contact-messages.controller.js";
import { PrismaContactMessageAnonymizer } from "./infrastructure/prisma-contact-message.anonymizer.js";
import {
  PrismaContactMessageReader,
  PrismaContactMessageRepository,
} from "./infrastructure/prisma-contact-messages.js";
import {
  PrismaContactSettingsReader,
  PrismaContactSettingsRepository,
} from "./infrastructure/prisma-contact-settings.js";
import {
  PrismaContactSubjectReader,
  PrismaContactSubjectRepository,
} from "./infrastructure/prisma-contact-subjects.js";

/**
 * **« Nous écrire »** — les objets de contact, la carte de contact de la
 * boutique, et les messages (`documentation/order/plan-nous-ecrire.md`).
 *
 * Importe `AccountModule` pour le seul `StaffDirectory` (l'auteur figé d'un
 * geste) ; le mailer et la cloche viennent de modules globaux. N'exporte rien :
 * aucun autre contexte ne lit ni n'écrit ces tables.
 */
@Module({
  imports: [AccountModule],
  controllers: [
    AdminContactSubjectsController,
    AdminContactSettingsController,
    AdminContactPhonesController,
    AdminContactMessagesController,
    ContactController,
    ContactMessagesController,
    MyContactMessagesController,
    ContactAnonymizationSweepController,
  ],
  providers: [
    { provide: ContactSubjectRepository, useClass: PrismaContactSubjectRepository },
    { provide: ContactSubjectReader, useClass: PrismaContactSubjectReader },
    { provide: ContactMessageRepository, useClass: PrismaContactMessageRepository },
    { provide: ContactMessageReader, useClass: PrismaContactMessageReader },
    { provide: ContactMessageAnonymizer, useClass: PrismaContactMessageAnonymizer },
    { provide: ContactSettingsReader, useClass: PrismaContactSettingsReader },
    { provide: ContactSettingsRepository, useClass: PrismaContactSettingsRepository },
    { provide: ContactPhoneRepository, useClass: PrismaContactPhoneRepository },
    { provide: ContactPhoneReader, useClass: PrismaContactPhoneReader },
    CreateContactPhoneHandler,
    ReviseContactPhoneHandler,
    ArchiveContactPhoneHandler,
    ListContactPhonesHandler,
    GetPublicContactSettingsHandler,
    CreateContactSubjectHandler,
    ReviseContactSubjectHandler,
    ArchiveContactSubjectHandler,
    UpdateContactSettingsHandler,
    SendContactMessageHandler,
    MarkContactMessageHandledHandler,
    AnonymizeHandledContactMessagesHandler,
    ListContactSubjectsHandler,
    ListOfferedContactSubjectsHandler,
    GetContactSettingsHandler,
    ListContactMessagesHandler,
    MailContactMessage,
    RingContactMessageReceived,
  ],
})
export class ContactModule {}
