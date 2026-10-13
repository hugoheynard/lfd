import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { TransferBinCounts } from "../domain/ports/transfer-bin-counts.reader.js";

/**
 * **Les bacs de chaque transfert, comptés** — l'adaptateur de
 * `TransferBinCounts` (lot T3). Deux lectures pour tout le lot : les
 * commandes encore portées, puis les bacs non annulés du transfert ou de ces
 * commandes (ceux d'avant T3).
 */
@Injectable()
export class PrismaTransferBinCounts extends TransferBinCounts {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async liveBinCounts(transferIds: readonly string[]): Promise<ReadonlyMap<string, number>> {
    if (transferIds.length === 0) {
      return new Map();
    }
    const items = await this.prisma.deliveryInternalTransferItem.findMany({
      where: { transferId: { in: [...transferIds] }, kind: "order", detachedAt: null },
      select: { transferId: true, orderId: true },
    });
    const transferOfOrder = new Map(
      items.flatMap((item) =>
        item.orderId === null ? [] : [[item.orderId, item.transferId] as const],
      ),
    );
    const bins = await this.prisma.deliveryBin.findMany({
      where: {
        voidedAt: null,
        OR: [
          { transferId: { in: [...transferIds] } },
          { orderId: { in: [...transferOfOrder.keys()] } },
        ],
      },
      select: { orderId: true, transferId: true },
    });
    const counts = new Map(transferIds.map((id) => [id, 0]));
    for (const bin of bins) {
      const owner = bin.transferId ?? transferOfOrder.get(bin.orderId ?? "");
      if (owner !== undefined) {
        counts.set(owner, (counts.get(owner) ?? 0) + 1);
      }
    }
    return counts;
  }
}
