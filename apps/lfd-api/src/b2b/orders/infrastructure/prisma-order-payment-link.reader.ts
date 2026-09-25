import { Injectable } from "@nestjs/common";

import { OrderStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OrderPaymentLinkReader,
  type OrderPaymentStanding,
} from "../domain/ports/order-payment-link.reader.js";
import { AWAITING_CARD_PAYMENT_STATUSES } from "../domain/services/payment-link.js";

/** Une page de suivi, pas un grand livre : bornée, la plus récente en tête. */
const LIST_LIMIT = 500;

const STANDING_SELECT = {
  id: true,
  orderNumber: true,
  companyId: true,
  totalCents: true,
  createdAt: true,
  status: true,
  paymentStatus: true,
  placedByUserId: true,
  company: { select: { raisonSociale: true } },
} as const;

interface StandingRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly companyId: string | null;
  readonly totalCents: number;
  readonly createdAt: Date;
  readonly status: OrderPaymentStanding["status"];
  readonly paymentStatus: OrderPaymentStanding["paymentStatus"];
  readonly placedByUserId: string;
  readonly company: { readonly raisonSociale: string } | null;
}

/**
 * Les commandes à régler par carte. Le filtre est celui d'`awaitsCardPayment`
 * (`domain/services/payment-link.ts`), écrit en SQL : règlement `pending` ou
 * `failed`, commande non annulée.
 */
@Injectable()
export class PrismaOrderPaymentLinkReader extends OrderPaymentLinkReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listAwaitingPayment(): Promise<readonly OrderPaymentStanding[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        paymentStatus: { in: [...AWAITING_CARD_PAYMENT_STATUSES] },
        status: { not: OrderStatus.cancelled },
      },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
      select: STANDING_SELECT,
    });
    return rows.map(toStanding);
  }

  async findStanding(orderId: string): Promise<OrderPaymentStanding | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: STANDING_SELECT,
    });
    return row === null ? null : toStanding(row);
  }
}

function toStanding(row: StandingRow): OrderPaymentStanding {
  return {
    orderId: row.id,
    reference: row.orderNumber,
    companyId: row.companyId,
    companyName: row.company?.raisonSociale ?? null,
    totalCents: row.totalCents,
    placedAt: row.createdAt,
    status: row.status,
    paymentStatus: row.paymentStatus,
    placedByUserId: row.placedByUserId,
  };
}
