import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { ProductSaleUnitUsageView } from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { GetProductSaleUnitUsageQuery } from "../application/get-product-sale-unit-usage.js";

/**
 * **Ce qui fige l'unité de vente des déclinaisons d'une fiche** — lu par la
 * carte « Tarif » avant qu'on essaie (`plan-changer-l-unite-de-vente.md`,
 * § 8). Même mur que la fiche.
 */
@AdminSurface("pim_catalog")
@Controller("catalogue/products")
export class ProductSaleUnitUsageController {
  constructor(private readonly queries: QueryBus) {}

  @Get(":id/sale-unit-usage")
  saleUnitUsage(@Param("id") id: string): Promise<ProductSaleUnitUsageView> {
    return this.queries.execute<GetProductSaleUnitUsageQuery, ProductSaleUnitUsageView>(
      new GetProductSaleUnitUsageQuery(id),
    );
  }
}
