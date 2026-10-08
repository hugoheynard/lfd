import type { BillingStatementView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { UnreadableStatementBodyError } from "../domain/errors/billing-statement-errors.js";
import { BillingStatementReader } from "../domain/ports/billing-statement.reader.js";
import {
  READABLE_BODY_VERSION,
  statementBodyV1Schema,
  statementBuyerSchema,
  statementSellerSchema,
} from "./billing-statement-json.schema.js";

/**
 * Relit un arrêté figé : sa ligne, ses identités, sa facture, ses bons. Aucun
 * recalcul — chaque montant est une colonne ou une clé du `body`.
 */
@Injectable()
export class PrismaBillingStatementReader extends BillingStatementReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async byId(statementId: string): Promise<BillingStatementView | null> {
    const row = await this.prisma.billingStatement.findUnique({
      where: { id: statementId },
      include: {
        orders: { select: { orderId: true } },
        line: { select: { batch: { select: { status: true } } } },
      },
    });
    if (row === null) {
      return null;
    }
    const seller = statementSellerSchema.safeParse(row.seller);
    const buyer = statementBuyerSchema.safeParse(row.buyer);
    const body = statementBodyV1Schema.safeParse(row.body);
    if (
      row.bodyVersion !== READABLE_BODY_VERSION ||
      !seller.success ||
      !buyer.success ||
      !body.success
    ) {
      throw new UnreadableStatementBodyError(row.id, row.bodyVersion);
    }
    return {
      id: row.id,
      batchId: row.batchId,
      lineRank: row.lineRank,
      status: row.status,
      batchStatus: row.line.batch.status,
      seller: seller.data,
      buyer: buyer.data,
      issuedOn: dayOf(row.issuedOn),
      periodStartsOn: row.periodStartsOn === null ? null : dayOf(row.periodStartsOn),
      periodEndsOn: row.periodEndsOn === null ? null : dayOf(row.periodEndsOn),
      totalHtCents: row.totalHtCents,
      totalVatCents: row.totalVatCents,
      totalTtcCents: row.totalTtcCents,
      ordersTotalCents: row.ordersTotalCents,
      invoice: body.data,
      bodyVersion: row.bodyVersion,
      computedWith: row.computedWith,
      orders: await this.ordersOf(row.orders.map((order) => order.orderId)),
    };
  }

  /** Les bons par leur numéro — l'identifiant est opaque, le numéro se relit. */
  private async ordersOf(orderIds: readonly string[]): Promise<BillingStatementView["orders"]> {
    const rows = await this.prisma.order.findMany({
      where: { id: { in: [...orderIds] } },
      select: { id: true, orderNumber: true },
    });
    const numbers = new Map(rows.map((order) => [order.id, order.orderNumber]));
    return orderIds
      .map((orderId) => ({ orderId, orderNumber: numbers.get(orderId) ?? null }))
      .sort((a, b) => (a.orderNumber ?? a.orderId).localeCompare(b.orderNumber ?? b.orderId));
  }
}

/** Une colonne `DATE` revient à minuit UTC (cf. l'adaptateur d'écriture) : son jour est sa clé. */
function dayOf(column: Date): string {
  return column.toISOString().slice(0, 10);
}
