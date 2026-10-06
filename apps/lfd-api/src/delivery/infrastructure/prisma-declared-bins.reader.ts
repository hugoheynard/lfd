import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { type DeclaredBinRow, DeclaredBinsReader } from "../domain/ports/declared-bins.reader.js";
import { binHalfOf } from "./bin-half.js";

/** Adaptateur Prisma des bacs déclarés lus par « Proposer » (CA4). Une requête, n'écrit rien. */
@Injectable()
export class PrismaDeclaredBinsReader extends DeclaredBinsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async liveAmong(orderIds: readonly string[]): Promise<readonly DeclaredBinRow[]> {
    if (orderIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.deliveryBin.findMany({
      where: { orderId: { in: [...orderIds] }, voidedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, orderId: true, binTypeId: true, half: true, physicalBinId: true },
    });
    return rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      binTypeId: row.binTypeId,
      half: binHalfOf(row.half),
      physicalBinId: row.physicalBinId,
    }));
  }
}
