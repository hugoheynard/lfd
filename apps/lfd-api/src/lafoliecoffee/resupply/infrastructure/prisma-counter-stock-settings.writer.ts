import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CounterStockSetting } from "../domain/counter-stock-setting.js";
import { CounterStockSettingsWriter } from "../domain/counter-stock-settings.writer.js";

/**
 * Pose le réglage d'un point (`counter_stock_settings`) : une ligne par
 * point, créée au premier réglage puis réécrite — jamais supprimée.
 */
@Injectable()
export class PrismaCounterStockSettingsWriter extends CounterStockSettingsWriter {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async put(setting: CounterStockSetting): Promise<void> {
    const columns = {
      stockTracking: setting.stockTracking,
      immediateWithoutStock: setting.immediateWithoutStock,
      updatedAt: setting.updated.at,
      updatedByStaffId: setting.updated.author.staffUserId,
      updatedByName: setting.updated.author.name,
      updatedByRole: setting.updated.author.role,
    };
    await this.prisma.counterStockSetting.upsert({
      where: { siteId: setting.siteId },
      create: { siteId: setting.siteId, ...columns },
      update: columns,
    });
  }
}
