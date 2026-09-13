import { Module } from "@nestjs/common";

import { AddSalesTermsParagraphHandler } from "./application/add-sales-terms-paragraph.handler.js";
import { EditSalesTermsParagraphHandler } from "./application/edit-sales-terms-paragraph.handler.js";
import { GetFooterContentHandler } from "./application/get-footer-content.handler.js";
import { GetSalesTermsHandler } from "./application/get-sales-terms.handler.js";
import { MoveSalesTermsParagraphHandler } from "./application/move-sales-terms-paragraph.handler.js";
import { RemoveSalesTermsParagraphHandler } from "./application/remove-sales-terms-paragraph.handler.js";
import { SaveFooterContentHandler } from "./application/save-footer-content.handler.js";
import { SetSalesTermsTitleHandler } from "./application/set-sales-terms-title.handler.js";
import { PlatformContentRepository } from "./domain/platform-content.repository.js";
import { AdminPlatformContentController } from "./http/admin-platform-content.controller.js";
import { PlatformContentController } from "./http/platform-content.controller.js";
import { PrismaPlatformContentRepository } from "./infrastructure/prisma-platform-content.repository.js";

/**
 * **Contenu de plateforme** — les textes de la vitrine, lus par tout le monde,
 * écrits par le staff.
 *
 * Il n'exporte rien : personne d'autre n'a affaire à ces textes. Le jour où un
 * e-mail transactionnel voudra la même signature de pied de page, il passera
 * par un port — pas par un import du repository.
 */
@Module({
  controllers: [PlatformContentController, AdminPlatformContentController],
  providers: [
    { provide: PlatformContentRepository, useClass: PrismaPlatformContentRepository },
    GetFooterContentHandler,
    SaveFooterContentHandler,
    GetSalesTermsHandler,
    SetSalesTermsTitleHandler,
    AddSalesTermsParagraphHandler,
    EditSalesTermsParagraphHandler,
    RemoveSalesTermsParagraphHandler,
    MoveSalesTermsParagraphHandler,
  ],
})
export class PlatformContentModule {}
