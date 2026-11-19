import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CounterStockSetting } from "../domain/counter-stock-setting.js";
import { CounterStockSettingsReader } from "../domain/counter-stock-settings.reader.js";

/** Les réglages posés (`counter_stock_settings`) des points demandés. */
@Injectable()
export class PrismaCounterStockSettingsReader extends CounterStockSettingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async of(siteIds: readonly string[]): Promise<ReadonlyMap<string, CounterStockSetting>> {
    if (siteIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.counterStockSetting.findMany({
      where: { siteId: { in: [...siteIds] } },
    });
    return new Map(
      rows.map((row) => [
        row.siteId,
        {
          siteId: row.siteId,
          stockTracking: row.stockTracking,
          updated: {
            at: row.updatedAt,
            author: {
              staffUserId: row.updatedByStaffId,
              name: row.updatedByName,
              role: row.updatedByRole,
            },
          },
        },
      ]),
    );
  }
}
