import { Module } from "@nestjs/common";

import { AddLegalDocumentParagraphHandler } from "./application/add-legal-document-paragraph.handler.js";
import { AddRequiredLegalSectionHandler } from "./application/add-required-legal-section.handler.js";
import { EditLegalDocumentParagraphHandler } from "./application/edit-legal-document-paragraph.handler.js";
import { GetFooterContentHandler } from "./application/get-footer-content.handler.js";
import { GetLegalDocumentHandler } from "./application/get-legal-document.handler.js";
import { GetPublishedLegalDocumentHandler } from "./application/get-published-legal-document.handler.js";
import { MoveLegalDocumentParagraphHandler } from "./application/move-legal-document-paragraph.handler.js";
import { RemoveLegalDocumentParagraphHandler } from "./application/remove-legal-document-paragraph.handler.js";
import { SaveFooterContentHandler } from "./application/save-footer-content.handler.js";
import { SetLegalDocumentTitleHandler } from "./application/set-legal-document-title.handler.js";
import { PlatformContentRepository } from "./domain/platform-content.repository.js";
import { AdminFooterContentController } from "./http/admin-footer-content.controller.js";
import { AdminPlatformContentController } from "./http/admin-platform-content.controller.js";
import { PlatformContentController } from "./http/platform-content.controller.js";
import { PrismaPlatformContentRepository } from "./infrastructure/prisma-platform-content.repository.js";
import { OrderSalesTermsReader } from "../orders/domain/ports/order-sales-terms.reader.js";
import { DepositLegalDocumentFileHandler } from "./application/deposit-legal-document-file.handler.js";
import { GetLegalDocumentFileHandler } from "./application/get-legal-document-file.handler.js";
import { ListLegalDocumentFilesHandler } from "./application/list-legal-document-files.handler.js";
import { LegalDocumentFileReader } from "./domain/legal-document-file.reader.js";
import { LegalDocumentFileRepository } from "./domain/legal-document-file.repository.js";
import { AdminLegalDocumentFilesController } from "./http/admin-legal-document-files.controller.js";
import { LegalDocumentFilesController } from "./http/legal-document-files.controller.js";
import { PrismaLegalDocumentFileReader } from "./infrastructure/prisma-legal-document-file.reader.js";
import { PrismaLegalDocumentFileRepository } from "./infrastructure/prisma-legal-document-file.repository.js";
import { PrismaOrderSalesTermsReader } from "./infrastructure/prisma-order-sales-terms.reader.js";

/**
 * **Contenu de plateforme** — les textes de la vitrine, lus par tout le monde,
 * écrits par le staff.
 *
 * Il n'exporte qu'un port : `OrderSalesTermsReader`, que la commande déclare
 * pour figer les CGV en vigueur à sa passation (plan des CGV, C4′). Le jour où
 * un e-mail transactionnel voudra la même signature de pied de page, il
 * passera aussi par un port — pas par un import du repository.
 */
@Module({
  controllers: [
    PlatformContentController,
    LegalDocumentFilesController,
    AdminPlatformContentController,
    AdminFooterContentController,
    AdminLegalDocumentFilesController,
  ],
  providers: [
    { provide: PlatformContentRepository, useClass: PrismaPlatformContentRepository },
    GetFooterContentHandler,
    SaveFooterContentHandler,
    GetLegalDocumentHandler,
    GetPublishedLegalDocumentHandler,
    SetLegalDocumentTitleHandler,
    AddLegalDocumentParagraphHandler,
    EditLegalDocumentParagraphHandler,
    RemoveLegalDocumentParagraphHandler,
    MoveLegalDocumentParagraphHandler,
    AddRequiredLegalSectionHandler,
    // Le PDF de référence des CGV (plan `legal/plan-cgv-par-audience.md`, C3) :
    // deux ports, l'écran dépose, la boutique télécharge.
    { provide: LegalDocumentFileRepository, useClass: PrismaLegalDocumentFileRepository },
    { provide: LegalDocumentFileReader, useClass: PrismaLegalDocumentFileReader },
    DepositLegalDocumentFileHandler,
    ListLegalDocumentFilesHandler,
    GetLegalDocumentFileHandler,
    // Les CGV en vigueur, lues par la passation (C4′) : le port est déclaré par
    // la commande, implémenté ici où vivent les textes.
    { provide: OrderSalesTermsReader, useClass: PrismaOrderSalesTermsReader },
  ],
  exports: [OrderSalesTermsReader],
})
export class PlatformContentModule {}
