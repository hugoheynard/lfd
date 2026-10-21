import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ResupplyReceiptSnapshot } from "../domain/resupply-receipt.js";
import { ResupplyReceiptReader } from "../domain/resupply-receipt.reader.js";
import { RECEIPT_LINES, receiptDayColumn, receiptSnapshotOf } from "./resupply-receipt.row.js";

/** Lecture Prisma des reçus d'un point pour une journée. */
@Injectable()
export class PrismaResupplyReceiptReader extends ResupplyReceiptReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async on(siteId: string, serviceDay: string): Promise<readonly ResupplyReceiptSnapshot[]> {
    const rows = await this.prisma.resupplyReceipt.findMany({
      where: { siteId, serviceDay: receiptDayColumn(serviceDay) },
      include: { lines: RECEIPT_LINES },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    });
    return rows.map(receiptSnapshotOf);
  }
}
