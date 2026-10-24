import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OrderShortfallReader,
  type OrderShortfallReading,
} from "../domain/ports/order-shortfall.reader.js";
import { shortfallLinesOf } from "./prisma-order-shortfall.repository.js";

/** La lecture du manque signalé, pour la fiche commande (lot E6a). */
@Injectable()
export class PrismaOrderShortfallReader extends OrderShortfallReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async of(orderId: string): Promise<OrderShortfallReading | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { shortfallReportedAt: true, shortfallLines: true },
    });
    if (row === null || row.shortfallReportedAt === null || row.shortfallLines === null) {
      return null;
    }
    return { reportedAt: row.shortfallReportedAt, lines: shortfallLinesOf(row.shortfallLines) };
  }
}
