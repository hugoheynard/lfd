import { Module } from "@nestjs/common";

import { BrandModule } from "../../../platform/brand/brand.module.js";
import { ProductionDayModule } from "../../day/production-day.module.js";
import { DayOrderLabelHeadReader } from "./application/services/day-order-label-head.reader.js";
import { OrderSheetPaper } from "./application/services/order-sheet-paper.service.js";
import { ProductionPaperArchive } from "./application/services/production-paper-archive.service.js";
import { ProductionDisplaySettingsReader } from "./domain/ports/production-display-settings.reader.js";
import { ProductionDisplaySettingsRepository } from "./domain/ports/production-display-settings.repository.js";
import { PrismaProductionDisplaySettingsReader } from "./infrastructure/prisma-production-display-settings.reader.js";
import { PrismaProductionDisplaySettingsRepository } from "./infrastructure/prisma-production-display-settings.repository.js";
import { ProductionDisplaySettingsVersion } from "./domain/ports/production-display-settings-version.js";
import { PrismaProductionDisplaySettingsVersion } from "./infrastructure/prisma-production-display-settings.version.js";

/**
 * **L'imprimerie du fournil** — ce que le plan et l'atelier injectent tous
 * deux pour leurs papiers : l'archive qui range et relit un exemplaire, et
 * les réglages d'affichage (le rangement par sous-catégorie), que la fiche,
 * le dossier, le prévisionnel et les réglages lisent ; et la fiche de
 * commande (`OrderSheetPaper`), que l'atelier imprime seule et le dossier du
 * jour en série. Le métier d'aucun.
 */
@Module({
  // Le logo de la fiche. La couleur d'une commande vient du canal
  // `channels/commerce/`, relié globalement par la racine de composition.
  // La journée : l'étiquette d'un sac la lit pour titrer une commande.
  imports: [BrandModule, ProductionDayModule],
  providers: [
    ProductionPaperArchive,
    OrderSheetPaper,
    // L'étiquette d'un sac, publiée pour le colisage ; reliée par `PackingFeedModule`.
    DayOrderLabelHeadReader,
    // Les réglages d'affichage : lire et régler sont deux ports (ISP).
    { provide: ProductionDisplaySettingsReader, useClass: PrismaProductionDisplaySettingsReader },
    {
      provide: ProductionDisplaySettingsRepository,
      useClass: PrismaProductionDisplaySettingsRepository,
    },
    // Son numéro, que la fiche gardée met dans son étiquette.
    {
      provide: ProductionDisplaySettingsVersion,
      useClass: PrismaProductionDisplaySettingsVersion,
    },
  ],
  exports: [
    ProductionPaperArchive,
    OrderSheetPaper,
    ProductionDisplaySettingsReader,
    ProductionDisplaySettingsRepository,
    ProductionDisplaySettingsVersion,
    DayOrderLabelHeadReader,
  ],
})
export class ProductionPrintModule {}

/**
 * Les fournisseurs que ce module exporte et que la racine de composition
 * (`appBootstrap/`) relie à un port d'un autre bloc : elle les prend ici,
 * jamais dans l'intérieur du métier.
 */
export { DayOrderLabelHeadReader };
