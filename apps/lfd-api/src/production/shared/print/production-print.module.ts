import { Module } from "@nestjs/common";

import { ProductionPaperArchive } from "./application/services/production-paper-archive.service.js";

/**
 * **L'archivage des papiers du fournil** — la primitive partagée que le plan
 * et l'atelier injectent pour ranger et relire un exemplaire.
 */
@Module({
  providers: [ProductionPaperArchive],
  exports: [ProductionPaperArchive],
})
export class ProductionPrintModule {}
