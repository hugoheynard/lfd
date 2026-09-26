import { Injectable } from "@nestjs/common";

import { OrderStatus, PaymentStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CompletedOrderReader,
  type CompletedOrder,
  type CompletedOrderPage,
} from "../domain/ports/completed-order.reader.js";

/** La règle « définitive », écrite une fois pour les deux lectures. */
const COMPLETED_WHERE = {
  status: OrderStatus.fulfilled,
  paymentStatus: PaymentStatus.paid,
  clientele: { not: null },
} as const;

const SELECT = {
  id: true,
  orderNumber: true,
  clientele: true,
  companyId: true,
  placedByUserId: true,
  totalCents: true,
  deliveryFeeCents: true,
  lateFeeCents: true,
  placedBy: { select: { auth0Sub: true } },
} as const;

interface CompletedRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly clientele: "pro" | "public" | null;
  readonly companyId: string | null;
  readonly placedByUserId: string;
  readonly totalCents: number;
  readonly deliveryFeeCents: number;
  readonly lateFeeCents: number;
  readonly placedBy: { readonly auth0Sub: string | null };
}

/**
 * Les commandes définitives en Postgres. Lit `users.auth0_sub` pour une seule
 * chose : dire si l'acheteur est un invité — le booléen sort, le `sub` jamais
 * (inscrit à `lint:auth0-id-readers`).
 */
@Injectable()
export class PrismaCompletedOrderReader extends CompletedOrderReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findCompleted(orderId: string): Promise<CompletedOrder | null> {
    const row = await this.prisma.order.findFirst({
      where: { id: orderId, ...COMPLETED_WHERE },
      select: SELECT,
    });
    return row === null ? null : toCompleted(row);
  }

  async listCompleted(after: string | null, limit: number): Promise<CompletedOrderPage> {
    const rows = await this.prisma.order.findMany({
      where: after === null ? COMPLETED_WHERE : { ...COMPLETED_WHERE, id: { gt: after } },
      select: SELECT,
      orderBy: { id: "asc" },
      take: limit,
    });
    const orders = rows.flatMap((row) => {
      const order = toCompleted(row);
      return order === null ? [] : [order];
    });
    const last = rows.at(-1);
    return { orders, nextAfter: rows.length < limit || last === undefined ? null : last.id };
  }
}

function toCompleted(row: CompletedRow): CompletedOrder | null {
  // Le `where` exclut déjà la clientèle nulle ; le type Prisma ne le sait pas.
  if (row.clientele === null) {
    return null;
  }
  return {
    orderId: row.id,
    orderNumber: row.orderNumber,
    clientele: row.clientele,
    companyId: row.companyId,
    placedByUserId: row.placedByUserId,
    buyerHasAccount: row.placedBy.auth0Sub !== null,
    totalCents: row.totalCents,
    deliveryFeeCents: row.deliveryFeeCents,
    lateFeeCents: row.lateFeeCents,
  };
}
