import { Module } from "@nestjs/common";

import { ProductionPaperArchive } from "./application/services/production-paper-archive.service.js";
import { ProductionDisplaySettingsReader } from "./domain/ports/production-display-settings.reader.js";
import { ProductionDisplaySettingsRepository } from "./domain/ports/production-display-settings.repository.js";
import { PrismaProductionDisplaySettingsReader } from "./infrastructure/prisma-production-display-settings.reader.js";
import { PrismaProductionDisplaySettingsRepository } from "./infrastructure/prisma-production-display-settings.repository.js";

/**
 * **L'imprimerie du fournil** — ce que le plan et l'atelier injectent tous
 * deux pour leurs papiers : l'archive qui range et relit un exemplaire, et
 * les réglages d'affichage (le rangement par sous-catégorie), que la fiche,
 * le dossier, le prévisionnel et les réglages lisent. Le métier d'aucun.
 */
@Module({
  providers: [
    ProductionPaperArchive,
    // Les réglages d'affichage : lire et régler sont deux ports (ISP).
    { provide: ProductionDisplaySettingsReader, useClass: PrismaProductionDisplaySettingsReader },
    {
      provide: ProductionDisplaySettingsRepository,
      useClass: PrismaProductionDisplaySettingsRepository,
    },
  ],
  exports: [
    ProductionPaperArchive,
    ProductionDisplaySettingsReader,
    ProductionDisplaySettingsRepository,
  ],
})
export class ProductionPrintModule {}
