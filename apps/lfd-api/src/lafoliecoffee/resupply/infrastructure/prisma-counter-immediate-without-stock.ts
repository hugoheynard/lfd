import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CounterImmediateWithoutStock } from "../domain/counter-immediate-without-stock.js";
import { IMMEDIATE_WITHOUT_STOCK_BY_DEFAULT } from "../domain/counter-stock-setting.js";

/** Le réglage du point (`counter_stock_settings`) ; sans ligne, le défaut. */
@Injectable()
export class PrismaCounterImmediateWithoutStock extends CounterImmediateWithoutStock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async allowsAt(siteId: string): Promise<boolean> {
    const row = await this.prisma.counterStockSetting.findUnique({
      where: { siteId },
      select: { immediateWithoutStock: true },
    });
    return row?.immediateWithoutStock ?? IMMEDIATE_WITHOUT_STOCK_BY_DEFAULT;
  }
}
