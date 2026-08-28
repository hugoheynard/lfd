import { Module } from "@nestjs/common";

import { GetFooterContentHandler } from "./application/get-footer-content.handler.js";
import { SaveFooterContentHandler } from "./application/save-footer-content.handler.js";
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
  ],
})
export class PlatformContentModule {}
