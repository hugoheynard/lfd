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
      select: {
        shortfallReportedAt: true,
        shortfallLines: true,
        shortfallDecision: { select: { decidedAt: true, remainder: true } },
      },
    });
    if (row === null || row.shortfallReportedAt === null || row.shortfallLines === null) {
      return null;
    }
    const decision = row.shortfallDecision;
    return {
      reportedAt: row.shortfallReportedAt,
      lines: shortfallLinesOf(row.shortfallLines),
      // `abandoned` seul : le CHECK de la table n'admet rien d'autre (E6b).
      decision:
        decision === null || decision.remainder !== "abandoned"
          ? null
          : { decidedAt: decision.decidedAt, remainder: decision.remainder },
    };
  }
}
