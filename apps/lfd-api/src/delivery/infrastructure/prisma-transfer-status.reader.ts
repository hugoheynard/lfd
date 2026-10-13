import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { type OrderTransferStatus, TransferStatusReader } from "../channels/handover/index.js";

/**
 * **« Arrivée au site ? »** — l'adaptateur de `TransferStatusReader` (plan du
 * transfert interne, §6.1, lot T2). Une lecture pour tout le lot ; seuls les
 * éléments PORTÉS comptent (un élément sorti n'engage plus la commande).
 */
@Injectable()
export class PrismaTransferStatusReader extends TransferStatusReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async statusOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, OrderTransferStatus>> {
    if (orderIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.deliveryInternalTransferItem.findMany({
      where: { kind: "order", orderId: { in: [...orderIds] }, detachedAt: null },
      select: {
        orderId: true,
        transfer: {
          select: {
            id: true,
            siteLabel: true,
            createdAt: true,
            departedAt: true,
            receivedAt: true,
          },
        },
      },
    });
    return new Map(
      rows.flatMap((row) =>
        row.orderId === null ? [] : [[row.orderId, statusOfTransfer(row.transfer)] as const],
      ),
    );
  }
}

function statusOfTransfer(transfer: {
  readonly id: string;
  readonly siteLabel: string;
  readonly createdAt: Date;
  readonly departedAt: Date | null;
  readonly receivedAt: Date | null;
}): OrderTransferStatus {
  const base = { transferId: transfer.id, siteLabel: transfer.siteLabel };
  if (transfer.receivedAt !== null) {
    return { ...base, state: "received", at: transfer.receivedAt };
  }
  if (transfer.departedAt !== null) {
    return { ...base, state: "departed", at: transfer.departedAt };
  }
  return { ...base, state: "planned", at: transfer.createdAt };
}
