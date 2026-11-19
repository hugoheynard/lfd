import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { STOCK_TRACKING_BY_DEFAULT } from "../domain/counter-stock-setting.js";
import { CounterStockTracking } from "../domain/counter-stock-tracking.js";

/** Le suivi du stock d'un point (`counter_stock_settings`) ; sans ligne, le défaut. */
@Injectable()
export class PrismaCounterStockTracking extends CounterStockTracking {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isTrackedAt(siteId: string): Promise<boolean> {
    const row = await this.prisma.counterStockSetting.findUnique({
      where: { siteId },
      select: { stockTracking: true },
    });
    return row?.stockTracking ?? STOCK_TRACKING_BY_DEFAULT;
  }
}
