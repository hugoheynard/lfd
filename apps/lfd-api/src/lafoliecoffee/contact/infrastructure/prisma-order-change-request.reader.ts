import type { OrderChangeRequestStatusView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderChangeRequestReader } from "../domain/ports/order-change-request.reader.js";

/**
 * Adaptateur Prisma des demandes de modification d'une commande. Une demande
 * anonymisée n'a plus de commande : elle sort d'elle-même de ces lectures.
 */
@Injectable()
export class PrismaOrderChangeRequestReader extends OrderChangeRequestReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async latestFor(orderId: string): Promise<OrderChangeRequestStatusView | null> {
    const row = await this.prisma.customerRequest.findFirst({
      where: { kind: "order_change", orderId },
      orderBy: { receivedAt: "desc" },
      select: {
        id: true,
        receivedAt: true,
        handledAt: true,
        changeAppliedRevision: true,
        changeRefusal: true,
      },
    });
    if (row === null) {
      return null;
    }
    return {
      id: row.id,
      status: statusOf(row.changeAppliedRevision, row.changeRefusal),
      requestedAt: row.receivedAt.toISOString(),
      answeredAt: row.handledAt?.toISOString() ?? null,
      refusalReason: row.changeRefusal,
    };
  }

  async hasPending(orderId: string): Promise<boolean> {
    const pending = await this.prisma.customerRequest.count({
      where: { kind: "order_change", orderId, handledAt: null, anonymizedAt: null },
    });
    return pending > 0;
  }
}

function statusOf(
  appliedRevision: number | null,
  refusal: string | null,
): OrderChangeRequestStatusView["status"] {
  if (appliedRevision !== null) {
    return "applied";
  }
  return refusal === null ? "pending" : "refused";
}
