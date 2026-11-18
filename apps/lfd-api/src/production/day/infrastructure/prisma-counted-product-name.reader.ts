import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CountedProductNameReader } from "../domain/ports/counted-product-name.reader.js";
import type { ServiceDay } from "../domain/value-objects/service-day.value-object.js";

/** `product_name` seul, d'une ligne du compte. */
@Injectable()
export class PrismaCountedProductNameReader extends CountedProductNameReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async nameOf(day: ServiceDay, sku: string): Promise<string | null> {
    const row = await this.prisma.productionCount.findFirst({
      where: { serviceDay: day.value, sku },
      select: { productName: true },
    });
    return row?.productName ?? null;
  }
}
