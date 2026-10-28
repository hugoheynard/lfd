import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CatalogPricePerKgReader,
  type CatalogPricePerKg,
} from "../domain/ports/catalog-price-per-kg.reader.js";
import { STILL_SOLD } from "./sellable-filter.js";

/**
 * Les prix au kilo, lus sur le miroir des articles. Le miroir n'est pas muré
 * par société : c'est le catalogue, le même pour tous.
 */
@Injectable()
export class PrismaCatalogPricePerKgReader extends CatalogPricePerKgReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async bySkus(skus: readonly string[]): Promise<ReadonlyMap<string, CatalogPricePerKg>> {
    if (skus.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.catalogItem.findMany({
      where: { sku: { in: [...skus] }, ...STILL_SOLD },
      select: { sku: true, proPricePerKgMillicents: true, publicPricePerKgTtcCents: true },
    });
    return new Map(
      rows.map((row) => [
        row.sku,
        {
          proPricePerKgMillicents: row.proPricePerKgMillicents,
          publicPricePerKgTtcCents: row.publicPricePerKgTtcCents,
        },
      ]),
    );
  }
}
