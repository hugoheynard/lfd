import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { RecurringSkuUsage } from "../../channels/commerce/recurring-sku-usage.js";

/** `RecurringSkuUsage` sur les lignes des gabarits, tous statuts confondus. */
@Injectable()
export class PrismaRecurringSkuUsage extends RecurringSkuUsage {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async skusInBaskets(skus: readonly string[]): Promise<ReadonlySet<string>> {
    if (skus.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.basketLine.findMany({
      where: { sku: { in: [...skus] } },
      select: { sku: true },
      distinct: ["sku"],
    });
    return new Set(rows.map((row) => row.sku));
  }
}
