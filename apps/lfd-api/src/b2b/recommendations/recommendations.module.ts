import { Module } from "@nestjs/common";

import { CatalogModule } from "../catalog/catalog.module.js";
import { OrderCutoffsModule } from "../order-cutoffs/order-cutoffs.module.js";
import { OrderCutoffsInForce } from "../order-cutoffs/domain/order-cutoffs-in-force.js";
import { RecordProductAudienceHandler } from "./application/commands/record-product-audience.handler.js";
import { ListProductAudienceCountersHandler } from "./application/queries/list-product-audience-counters.handler.js";
import { RecommendationFilter } from "./application/services/recommendation-filter.js";
import { AudienceCounterReader } from "./domain/ports/audience-counter.reader.js";
import { AudienceCounterWriter } from "./domain/ports/audience-counter.writer.js";
import { AudienceSkuReader } from "./domain/ports/audience-sku.reader.js";
import { RecommendationCutoffReader } from "./domain/ports/recommendation-cutoff.reader.js";
import { AdminProductAudienceController } from "./http/admin-product-audience.controller.js";
import { ShopProductAudienceController } from "./http/shop-product-audience.controller.js";
import { CatalogAudienceSkuReader } from "./infrastructure/catalog-audience-sku.reader.js";
import {
  PrismaAudienceCounterReader,
  PrismaAudienceCounterWriter,
} from "./infrastructure/prisma-audience-counters.js";

/**
 * **La recommandation de produits** — R0 : le filtre commun des suggestions et
 * les compteurs d'audience anonymes
 * (`documentation/recommandation-produit/plan-recommandation-de-produits.md`).
 *
 * Lit le catalogue servi (`CatalogModule`) et l'heure limite du commerce
 * (`OrderCutoffsModule`) par leurs ports. Écrit seul la table
 * `growth.product_audience_counters`. N'exporte rien pour l'instant : les
 * queries de suggestion (R1, R2) vivront ici et emploieront `RecommendationFilter`.
 */
@Module({
  imports: [CatalogModule, OrderCutoffsModule],
  controllers: [ShopProductAudienceController, AdminProductAudienceController],
  providers: [
    RecordProductAudienceHandler,
    ListProductAudienceCountersHandler,
    RecommendationFilter,
    { provide: RecommendationCutoffReader, useExisting: OrderCutoffsInForce },
    { provide: AudienceSkuReader, useClass: CatalogAudienceSkuReader },
    { provide: AudienceCounterWriter, useClass: PrismaAudienceCounterWriter },
    { provide: AudienceCounterReader, useClass: PrismaAudienceCounterReader },
  ],
})
export class RecommendationsModule {}
