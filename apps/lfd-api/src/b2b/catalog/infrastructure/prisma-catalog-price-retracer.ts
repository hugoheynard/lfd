import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CatalogPriceRetracer } from "../domain/ports/catalog-price-retracer.js";
import { lastRecordedPrices, priceTraceRows } from "./catalog-price-trace.js";
import { STILL_SOLD } from "./sellable-filter.js";

/**
 * Le retraçage, par la règle partagée de la trace — aucune règle à lui.
 *
 * Il lit le miroir (`catalog_items`, prix et taux reçus du référentiel), le
 * dernier couple tracé de chaque SKU, et n'écrit que la différence. Il ne lit
 * pas `catalog_item_overrides` : c'est précisément le prix décidé qu'il
 * remplace dans l'historique.
 */
@Injectable()
export class PrismaCatalogPriceRetracer extends CatalogPriceRetracer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async retrace(at: Date): Promise<readonly string[]> {
    const items = await this.prisma.catalogItem.findMany({
      where: { ...STILL_SOLD },
      select: { sku: true, productSku: true, priceMillicents: true, vatRatePercent: true },
      orderBy: { sku: "asc" },
    });
    const recorded = await lastRecordedPrices(
      this.prisma,
      items.map((item) => item.sku),
    );
    const changes = priceTraceRows(
      items.map((item) => ({
        sku: item.sku,
        productSku: item.productSku,
        pimPriceMillicents: item.priceMillicents,
        vatRatePercent: item.vatRatePercent === null ? null : item.vatRatePercent.toNumber(),
      })),
      recorded,
      () => this.ids.next(),
      at,
    );
    if (changes.length > 0) {
      await this.prisma.catalogPriceHistory.createMany({ data: changes });
    }
    return changes.map((change) => change.sku);
  }
}
