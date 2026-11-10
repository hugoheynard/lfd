import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderBilling } from "../domain/entities/order-billing.js";
import { OrderBillingRepository } from "../domain/ports/order-billing.repository.js";
import {
  BILLABLE_SELECT,
  billableColumns,
  billableOf,
  dayOf,
  ORDER_AMOUNTS_SELECT,
  orderAmountsOf,
} from "./order-money-columns.js";

const BILLING_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  receivedOn: true,
  // « Partiel » = une décision existe pour UN envoi de la commande (plan E7
  // reliquat, LB, choix 15) : une suffit à le dire.
  shortfallDecisions: { select: { id: true }, take: 1 },
  ...ORDER_AMOUNTS_SELECT,
  ...BILLABLE_SELECT,
} as const satisfies Prisma.OrderSelect;

type BillingRow = Prisma.OrderGetPayload<{ select: typeof BILLING_SELECT }>;

function billingOf(row: BillingRow): OrderBilling {
  return OrderBilling.fromSnapshot({
    orderId: row.id,
    reference: row.orderNumber,
    status: row.status,
    partial: row.shortfallDecisions.length > 0,
    receivedOn: dayOf(row.receivedOn),
    orderAmounts: orderAmountsOf(row),
    billable: billableOf(row),
    settledOn: dayOf(row.settledOn),
  });
}

/**
 * L'adaptateur du solde (E6c1). Par le client routé : il écrit dans l'unité
 * de travail de l'appelant (le suivi du BL à la remise, ou le réconciliateur).
 */
@Injectable()
export class PrismaOrderBillingRepository extends OrderBillingRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(orderIds: readonly string[]): Promise<readonly OrderBilling[]> {
    const rows = await this.prisma.order.findMany({
      where: { id: { in: [...orderIds] } },
      select: BILLING_SELECT,
    });
    return rows.map(billingOf);
  }

  async lock(orderId: string): Promise<OrderBilling | null> {
    await this.prisma.$queryRaw`
      SELECT "id" FROM "public"."orders" WHERE "id" = ${orderId} FOR UPDATE`;
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: BILLING_SELECT,
    });
    return row === null ? null : billingOf(row);
  }

  async save(billing: OrderBilling): Promise<boolean> {
    const write = billing.pendingWrite;
    const { billable, settledOn, orderId } = billing.toSnapshot();
    if (write === null || billable === null || settledOn === null) {
      return false;
    }
    // Une pose ne franchit que sur des montants vides : le second des deux
    // écrivains (suivi, réconciliateur) perd sans rien écraser (plan § 13).
    const { count } = await this.prisma.order.updateMany({
      where: write === "closed" ? { id: orderId, billableTotalCents: null } : { id: orderId },
      data: billableColumns(billable, settledOn),
    });
    return count === 1;
  }
}
