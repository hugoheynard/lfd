import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  OrderCardStandingReader,
  type OrderCardStanding,
} from "../domain/ports/order-card-standing.reader.js";
import { orderCardSettled } from "../domain/services/order-card-settled.js";

const SELECTED = {
  id: true,
  orderNumber: true,
  stripePaymentIntentId: true,
  totalCents: true,
  status: true,
  paymentStatus: true,
} as const;

interface StandingRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly stripePaymentIntentId: string | null;
  readonly totalCents: number;
  readonly status: string;
  readonly paymentStatus: string;
}

function standingOf(row: StandingRow): OrderCardStanding {
  return {
    orderId: row.id,
    orderNumber: row.orderNumber,
    providerRef: row.stripePaymentIntentId,
    totalCents: row.totalCents,
    cancelled: row.status === "cancelled",
    settled: orderCardSettled(row.status, row.paymentStatus),
  };
}

/** Adaptateur Prisma : la ligne `orders`, par le client routé (transaction de l'appelant). */
@Injectable()
export class PrismaOrderCardStandingReader extends OrderCardStandingReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofOrder(orderId: string): Promise<OrderCardStanding | null> {
    const row = await this.prisma.order.findUnique({ where: { id: orderId }, select: SELECTED });
    return row === null ? null : standingOf(row);
  }

  async ofIntent(providerRef: string): Promise<OrderCardStanding | null> {
    const row = await this.prisma.order.findUnique({
      where: { stripePaymentIntentId: providerRef },
      select: SELECTED,
    });
    return row === null ? null : standingOf(row);
  }

  async withIntentCreatedSince(since: Date): Promise<readonly OrderCardStanding[]> {
    const rows = await this.prisma.order.findMany({
      where: { createdAt: { gte: since }, stripePaymentIntentId: { not: null } },
      select: SELECTED,
      orderBy: { createdAt: "asc" },
    });
    return rows.map(standingOf);
  }
}
