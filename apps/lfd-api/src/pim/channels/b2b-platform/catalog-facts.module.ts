import { Global, Module } from "@nestjs/common";

import { AccountingRulesModule } from "../../accounting-rules/accounting-rules.module.js";
import { AllergensModule } from "../../allergens/allergens.module.js";
import { CatalogueModule } from "../../catalogue/catalogue.module.js";
import { CatalogEmitter } from "../../catalogue/shared/domain/ports/catalog-emitter.js";
import { CatalogReemission } from "../../catalogue/shared/domain/ports/catalog-reemission.js";
import { PimDatabaseModule } from "../../infra/database/pim-database.module.js";
import { VatRatesModule } from "../../vat-rates/vat-rates.module.js";
import { B2bCatalogFactsEmitter } from "./products/catalog-facts.emitter.js";
import { CatalogFactsSource } from "./products/catalog-facts.source.js";
import { CatalogSnapshots } from "./products/catalog-snapshots.js";
import { B2bCatalogReemission } from "./products/catalog-reemission.service.js";
import { PrismaPublicationSequence } from "./products/prisma-publication-sequence.js";
import { PublicationSequence } from "./products/publication-sequence.js";

/**
 * **Le branchement des faits du catalogue** (lot 2a de
 * `documentation/pim/plan-catalogue-synchronise-par-audience.md`).
 *
 * Le catalogue — et les référentiels qui changent un instantané : taux,
 * contextes, allergènes, réglages comptables — DÉCLARENT `CatalogEmitter` et
 * `CatalogReemission` ; ce canal les implémente. Global, parce que ces modules
 * sont importés PAR le canal (ADR-13 : le canal dépend du catalogue, jamais
 * l'inverse) : un import dans l'autre sens ferait un cycle de modules.
 */
@Global()
@Module({
  imports: [
    PimDatabaseModule,
    CatalogueModule,
    AccountingRulesModule,
    AllergensModule,
    VatRatesModule,
  ],
  providers: [
    { provide: CatalogSnapshots, useClass: CatalogFactsSource },
    { provide: PublicationSequence, useClass: PrismaPublicationSequence },
    { provide: CatalogEmitter, useClass: B2bCatalogFactsEmitter },
    { provide: CatalogReemission, useClass: B2bCatalogReemission },
  ],
  exports: [CatalogEmitter, CatalogReemission],
})
export class CatalogFactsModule {}
