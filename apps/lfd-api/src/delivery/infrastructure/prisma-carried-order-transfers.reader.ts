import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  CarriedOrderTransfers,
  type CarriedOrderTransferRow,
} from "../domain/ports/carried-order-transfers.reader.js";

/**
 * **Le transfert qui porte chaque commande** — l'adaptateur de
 * `CarriedOrderTransfers` (plan du transfert interne, §6.1, lots T2, T3).
 * Une lecture pour tout le lot ; seuls les éléments PORTÉS comptent (un
 * élément sorti n'engage plus la commande).
 */
@Injectable()
export class PrismaCarriedOrderTransfers extends CarriedOrderTransfers {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async carriedAmong(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, CarriedOrderTransferRow>> {
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
        row.orderId === null ? [] : [[row.orderId, stateOfTransfer(row.transfer)] as const],
      ),
    );
  }
}

function stateOfTransfer(transfer: {
  readonly id: string;
  readonly siteLabel: string;
  readonly createdAt: Date;
  readonly departedAt: Date | null;
  readonly receivedAt: Date | null;
}): CarriedOrderTransferRow {
  const base = { transferId: transfer.id, siteLabel: transfer.siteLabel };
  if (transfer.receivedAt !== null) {
    return { ...base, state: "received", at: transfer.receivedAt };
  }
  if (transfer.departedAt !== null) {
    return { ...base, state: "departed", at: transfer.departedAt };
  }
  return { ...base, state: "planned", at: transfer.createdAt };
}
