import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { AnonymizeCustomerRequestsHandler } from "./application/commands/anonymize-customer-requests.handler.js";
import { ArchiveContactPhoneHandler } from "./application/commands/archive-contact-phone.handler.js";
import { ArchiveRequestReasonHandler } from "./application/commands/archive-request-reason.handler.js";
import { CreateContactPhoneHandler } from "./application/commands/create-contact-phone.handler.js";
import { CreateRequestReasonHandler } from "./application/commands/create-request-reason.handler.js";
import { MarkCustomerRequestHandledHandler } from "./application/commands/mark-customer-request-handled.handler.js";
import { ReportOrderProblemHandler } from "./application/commands/report-order-problem.handler.js";
import { ReviseContactPhoneHandler } from "./application/commands/revise-contact-phone.handler.js";
import { ReviseRequestReasonHandler } from "./application/commands/revise-request-reason.handler.js";
import { SendContactMessageHandler } from "./application/commands/send-contact-message.handler.js";
import { UpdateContactSettingsHandler } from "./application/commands/update-contact-settings.handler.js";
import { MailCustomerRequest } from "./application/handlers/mail-customer-request.handler.js";
import { RingCustomerRequestReceived } from "./application/handlers/ring-customer-request-received.handler.js";
import { GetContactSettingsHandler } from "./application/queries/get-contact-settings.handler.js";
import { GetCustomerRequestPhotoHandler } from "./application/queries/get-customer-request-photo.handler.js";
import { GetPublicContactSettingsHandler } from "./application/queries/get-public-contact-settings.handler.js";
import { ListContactPhonesHandler } from "./application/queries/list-contact-phones.handler.js";
import { ListCustomerRequestsHandler } from "./application/queries/list-customer-requests.handler.js";
import { ListOfferedRequestReasonsHandler } from "./application/queries/list-offered-request-reasons.handler.js";
import { ListRequestReasonsHandler } from "./application/queries/list-request-reasons.handler.js";
import { ContactPhoneReader } from "./domain/ports/contact-phone.reader.js";
import { ContactPhoneRepository } from "./domain/ports/contact-phone.repository.js";
import { ContactSenderAudience } from "./domain/ports/contact-sender-audience.js";
import { ContactSettingsReader } from "./domain/ports/contact-settings.reader.js";
import { ContactSettingsRepository } from "./domain/ports/contact-settings.repository.js";
import { CustomerRequestReader } from "./domain/ports/customer-request.reader.js";
import { CustomerRequestRepository } from "./domain/ports/customer-request.repository.js";
import { CustomerRequestRetention } from "./domain/ports/customer-request.retention.js";
import { ReportableOrderReader } from "./domain/ports/reportable-order.reader.js";
import { RequestAuthorDirectory } from "./domain/ports/request-author.directory.js";
import { RequestPhotoStore } from "./domain/ports/request-photo.store.js";
import { RequestReasonReader } from "./domain/ports/request-reason.reader.js";
import { RequestReasonRepository } from "./domain/ports/request-reason.repository.js";
import { AdminContactPhonesController } from "./http/admin-contact-phones.controller.js";
import { AdminContactSettingsController } from "./http/admin-contact-settings.controller.js";
import { AdminCustomerRequestsController } from "./http/admin-customer-requests.controller.js";
import { AdminRequestReasonsController } from "./http/admin-request-reasons.controller.js";
import { ContactAnonymizationSweepController } from "./http/contact-anonymization-sweep.controller.js";
import { ContactMessagesController } from "./http/contact-messages.controller.js";
import { ContactController } from "./http/contact.controller.js";
import { MyContactMessagesController } from "./http/my-contact-messages.controller.js";
import { MyOrderProblemsController } from "./http/my-order-problems.controller.js";
import { DocumentRequestPhotoStore } from "./infrastructure/document-request-photo.store.js";
import { OrderReportableOrderReader } from "./infrastructure/order-reportable-order.reader.js";
import {
  PrismaContactPhoneReader,
  PrismaContactPhoneRepository,
} from "./infrastructure/prisma-contact-phones.js";
import { PrismaContactSenderAudience } from "./infrastructure/prisma-contact-sender-audience.js";
import {
  PrismaContactSettingsReader,
  PrismaContactSettingsRepository,
} from "./infrastructure/prisma-contact-settings.js";
import { PrismaCustomerRequestReader } from "./infrastructure/prisma-customer-request.reader.js";
import { PrismaCustomerRequestRepository } from "./infrastructure/prisma-customer-request.repository.js";
import { PrismaCustomerRequestRetention } from "./infrastructure/prisma-customer-request.retention.js";
import { PrismaRequestAuthorDirectory } from "./infrastructure/prisma-request-author.directory.js";
import {
  PrismaRequestReasonReader,
  PrismaRequestReasonRepository,
} from "./infrastructure/prisma-request-reasons.js";

/**
 * **Les demandes clients** — motifs par formulaire, demandes (« Nous écrire »,
 * « Signaler un problème ») et leurs photos, la carte de contact et ses
 * numéros (`documentation/contenu-ecommerce/demandes-clients.md`).
 *
 * Importe `AccountModule` pour le `StaffDirectory` (l'auteur figé d'un geste),
 * et `OrdersModule` pour LIRE la commande signalée par ses ports et sa règle
 * d'accès. Le mailer et la cloche viennent de modules globaux. N'exporte
 * rien : aucun autre contexte ne lit ni n'écrit ces tables.
 */
@Module({
  imports: [AccountModule, OrdersModule],
  controllers: [
    AdminRequestReasonsController,
    AdminCustomerRequestsController,
    AdminContactSettingsController,
    AdminContactPhonesController,
    ContactController,
    ContactMessagesController,
    MyContactMessagesController,
    MyOrderProblemsController,
    ContactAnonymizationSweepController,
  ],
  providers: [
    { provide: RequestReasonRepository, useClass: PrismaRequestReasonRepository },
    { provide: RequestReasonReader, useClass: PrismaRequestReasonReader },
    { provide: CustomerRequestRepository, useClass: PrismaCustomerRequestRepository },
    { provide: CustomerRequestReader, useClass: PrismaCustomerRequestReader },
    { provide: CustomerRequestRetention, useClass: PrismaCustomerRequestRetention },
    { provide: RequestPhotoStore, useClass: DocumentRequestPhotoStore },
    { provide: ReportableOrderReader, useClass: OrderReportableOrderReader },
    { provide: RequestAuthorDirectory, useClass: PrismaRequestAuthorDirectory },
    { provide: ContactSettingsReader, useClass: PrismaContactSettingsReader },
    { provide: ContactSettingsRepository, useClass: PrismaContactSettingsRepository },
    { provide: ContactSenderAudience, useClass: PrismaContactSenderAudience },
    { provide: ContactPhoneRepository, useClass: PrismaContactPhoneRepository },
    { provide: ContactPhoneReader, useClass: PrismaContactPhoneReader },
    CreateRequestReasonHandler,
    ReviseRequestReasonHandler,
    ArchiveRequestReasonHandler,
    ListRequestReasonsHandler,
    ListOfferedRequestReasonsHandler,
    SendContactMessageHandler,
    ReportOrderProblemHandler,
    MarkCustomerRequestHandledHandler,
    AnonymizeCustomerRequestsHandler,
    ListCustomerRequestsHandler,
    GetCustomerRequestPhotoHandler,
    CreateContactPhoneHandler,
    ReviseContactPhoneHandler,
    ArchiveContactPhoneHandler,
    ListContactPhonesHandler,
    UpdateContactSettingsHandler,
    GetContactSettingsHandler,
    GetPublicContactSettingsHandler,
    MailCustomerRequest,
    RingCustomerRequestReceived,
  ],
})
export class ContactModule {}
