import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { StockAlertSnapshot } from "../domain/stock-alert.js";
import { StockAlertReader } from "../domain/stock-alert.reader.js";
import { stockAlertSnapshotOf } from "./stock-alert.row.js";

const RECENT_FIRST = [{ declaredAt: "desc" }, { id: "desc" }] as const;

/** Lecture Prisma des alertes vivantes, pour le comptoir et pour le fournil. */
@Injectable()
export class PrismaStockAlertReader extends StockAlertReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async liveForSite(siteId: string): Promise<readonly StockAlertSnapshot[]> {
    const rows = await this.prisma.siteStockAlert.findMany({
      where: { siteId, liftedAt: null },
      orderBy: [...RECENT_FIRST],
    });
    return rows.map(stockAlertSnapshotOf);
  }

  async liveEverywhere(): Promise<readonly StockAlertSnapshot[]> {
    const rows = await this.prisma.siteStockAlert.findMany({
      where: { liftedAt: null },
      orderBy: [...RECENT_FIRST],
    });
    return rows.map(stockAlertSnapshotOf);
  }
}
