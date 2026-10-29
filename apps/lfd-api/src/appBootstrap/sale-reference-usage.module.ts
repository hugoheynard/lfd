import { Global, Module } from "@nestjs/common";

import { CatalogModule } from "../b2b/catalog/catalog.module.js";
import { PrismaSaleReferenceUsage } from "../b2b/catalog/infrastructure/prisma-sale-reference-usage.js";
import { SaleReferenceUsage } from "../pim/channels/b2b-platform/sale-reference-usage/sale-reference-usage.js";

/**
 * **« Cette référence a-t-elle servi ? », posée par le référentiel au
 * commerce** (`plan-changer-l-unite-de-vente.md`, § 8). Le motif de
 * `GeneralOrderCutoffModule` : `@Global` parce que le consommateur est `pim/`,
 * qui ne peut pas importer un module du commerce.
 */
@Global()
@Module({
  imports: [CatalogModule],
  providers: [{ provide: SaleReferenceUsage, useExisting: PrismaSaleReferenceUsage }],
  exports: [SaleReferenceUsage],
})
export class SaleReferenceUsageModule {}
