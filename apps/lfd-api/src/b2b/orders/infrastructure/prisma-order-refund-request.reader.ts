import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OrderRefundRequestReader,
  type RefundRequestSnapshot,
} from "../domain/ports/order-refund-request.reader.js";
import { REFUND_REQUEST_SELECT } from "./prisma-order-refund-request.repository.js";

/** Adaptateur de lecture, sans verrou. Pas de mur tenant : surface staff et machine. */
@Injectable()
export class PrismaOrderRefundRequestReader extends OrderRefundRequestReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async dueForSweep(wallNow: Date, limit: number): Promise<readonly string[]> {
    const rows = await this.prisma.orderRefundRequest.findMany({
      where: { stripeRefundId: null, nextAttemptAt: { lte: wallNow } },
      orderBy: [{ nextAttemptAt: "asc" }, { orderId: "asc" }],
      take: limit,
      select: { orderId: true },
    });
    return rows.map((row) => row.orderId);
  }

  async paymentIntentOf(orderId: string): Promise<string | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { stripePaymentIntentId: true },
    });
    return row?.stripePaymentIntentId ?? null;
  }

  async snapshotOf(orderId: string): Promise<RefundRequestSnapshot | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        totalCents: true,
        refundRequest: { select: REFUND_REQUEST_SELECT },
        refunds: { select: { stripeRefundId: true, amountCents: true, status: true } },
      },
    });
    if (row === null || row.refundRequest === null) {
      return null;
    }
    return {
      request: row.refundRequest,
      orderNumber: row.orderNumber,
      chargedCents: row.totalCents,
      refunds: row.refunds,
    };
  }
}
