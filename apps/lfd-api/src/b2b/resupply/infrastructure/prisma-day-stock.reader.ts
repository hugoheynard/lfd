import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { type DayStockSite, DayStockReader } from "../domain/day-stock.reader.js";
import type { ResupplyReceiptSnapshot } from "../domain/resupply-receipt.js";
import { isPlaced, type PlacedSiteResupplySnapshot } from "../domain/site-resupply.js";
import { RECEIPT_LINES, receiptDayColumn, receiptSnapshotOf } from "./resupply-receipt.row.js";
import { dayColumn, SITE_RESUPPLY_LINES, snapshotOf } from "./site-resupply.row.js";

/** Lecture Prisma de l'onglet Stock : une journée, tous points. */
@Injectable()
export class PrismaDayStockReader extends DayStockReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async sites(): Promise<readonly DayStockSite[]> {
    return this.prisma.site.findMany({
      where: { archivedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, label: true },
    });
  }

  async resuppliesOn(serviceDay: string): Promise<readonly PlacedSiteResupplySnapshot[]> {
    const rows = await this.prisma.siteResupply.findMany({
      where: { serviceDay: dayColumn(serviceDay), placedAt: { not: null } },
      include: { lines: SITE_RESUPPLY_LINES },
      orderBy: [{ placedAt: "asc" }, { id: "asc" }],
    });
    return rows.map(snapshotOf).filter(isPlaced);
  }

  async receiptsOn(serviceDay: string): Promise<readonly ResupplyReceiptSnapshot[]> {
    const rows = await this.prisma.resupplyReceipt.findMany({
      where: { serviceDay: receiptDayColumn(serviceDay) },
      include: { lines: RECEIPT_LINES },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    });
    return rows.map(receiptSnapshotOf);
  }
}
