import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { COMMERCIAL_INVOICE } from "../domain/entities/invoice.types.js";
import {
  ProcedureOrdersReader,
  type ProcedureOrderRow,
  type ProcedureOrdersScope,
} from "../domain/ports/procedure-orders.reader.js";
import { accountOrderWhere, billableOrderWhere, dayColumnOf } from "./billable-order-criterion.js";

/** `AAAA-MM-JJ`. */
const DAY_LENGTH = 10;

/** `@db.Date` : minuit UTC, dont la date ISO EST le jour de Paris. */
function dayOf(column: Date | null): string | null {
  return column?.toISOString().slice(0, DAY_LENGTH) ?? null;
}

/**
 * Les commandes d'une période de procédure, en trois lectures groupées :
 * les bons des factures de la clôture, puis les commandes des trois branches
 * (un seul `findMany`), puis les factures 380 qui les portent. `invoice_order`
 * n'a pas de relation vers `orders` (l'id est opaque) : jointes en mémoire,
 * comme `PrismaMonthlyInvoicingReader`. Les critères d'assiette sont ceux de
 * `billable-order-criterion.ts`, jamais recopiés.
 *
 * Surface staff : aucune société n'est filtrée, c'est la comptabilité qui lit.
 */
@Injectable()
export class PrismaProcedureOrdersReader extends ProcedureOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofPeriod(scope: ProcedureOrdersScope): Promise<readonly ProcedureOrderRow[]> {
    const carried = await this.prisma.invoiceOrder.findMany({
      where: { invoiceId: { in: [...scope.periodInvoiceIds] }, invoiceType: COMMERCIAL_INVOICE },
      select: { orderId: true },
    });
    const orders = await this.prisma.order.findMany({
      where: {
        OR: [
          { id: { in: carried.map((row) => row.orderId) } },
          billableOrderWhere(scope.deliveredFrom, scope.deliveredTo),
          {
            ...accountOrderWhere(),
            receivedOn: null,
            requestedDeliveryDate: {
              gte: dayColumnOf(scope.servedFrom),
              lte: dayColumnOf(scope.servedThrough),
              lt: dayColumnOf(scope.servedBefore),
            },
          },
        ],
      },
      select: {
        id: true,
        orderNumber: true,
        companyId: true,
        requestedDeliveryDate: true,
        fulfillmentMethod: true,
        totalCents: true,
        createdAt: true,
        billedCompanyId: true,
        handedOverAt: true,
        receivedOn: true,
        company: { select: { raisonSociale: true } },
      },
    });
    const invoices = await this.invoicesOf(orders.map((order) => order.id));
    return orders.flatMap((row): ProcedureOrderRow[] =>
      row.companyId === null
        ? []
        : [
            {
              orderId: row.id,
              orderNumber: row.orderNumber,
              companyId: row.companyId,
              companyName: row.company?.raisonSociale ?? "",
              serviceDay: dayOf(row.requestedDeliveryDate),
              fulfillmentMethod: row.fulfillmentMethod === "pickup" ? "pickup" : "delivery",
              totalCents: row.totalCents,
              placedAt: row.createdAt,
              billedCompanyId: row.billedCompanyId,
              handedOver: row.handedOverAt !== null,
              receivedOn: dayOf(row.receivedOn),
              invoice: invoices.get(row.id) ?? null,
            },
          ],
    );
  }

  /** La facture 380 de chaque commande — une au plus (`invoice_order_invoiced_once`). */
  private async invoicesOf(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, { readonly invoiceId: string; readonly number: string }>> {
    const rows = await this.prisma.invoiceOrder.findMany({
      where: { orderId: { in: [...orderIds] }, invoiceType: COMMERCIAL_INVOICE },
      select: { orderId: true, invoiceId: true, invoice: { select: { number: true } } },
    });
    return new Map(
      rows.map((row) => [row.orderId, { invoiceId: row.invoiceId, number: row.invoice.number }]),
    );
  }
}
