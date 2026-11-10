import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { COMMERCIAL_INVOICE } from "../domain/entities/invoice.types.js";
import {
  ProcedureOrdersReader,
  type ProcedureOrderRow,
  type ProcedureOrdersScope,
} from "../domain/ports/procedure-orders.reader.js";
import { accountOrderWhere, billableOrderWhere, dayColumnOf } from "./billable-order-criterion.js";

/** Une partie retirée, le reste à venir : pas facturable avant son solde. */
const PARTIALLY_HANDED_OVER = "partially_handed_over" as const;

/** Le rang de la commande elle-même ; au-delà, un reste (plan E7 reliquat). */
const FIRST_RANK = 1;

/** Les BL encore à remettre : ni remis, ni annulés. */
const PENDING_NOTE_STATUSES = ["planned", "prepared"] as const;

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
            // Pas soldée (E6c2) : une commande remise en partie attend encore.
            // En partie retirée, elle en est — « partielle, reste à relivrer »
            // (décision de Hugo du 2026-10-26, qui annule l'exclusion de L5c).
            settledOn: null,
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
        billableTotalCents: true,
        createdAt: true,
        billedCompanyId: true,
        handedOverAt: true,
        settledOn: true,
        status: true,
        company: { select: { raisonSociale: true } },
        deliveryNotes: {
          where: { rank: { gt: FIRST_RANK }, status: { in: [...PENDING_NOTE_STATUSES] } },
          orderBy: { serviceDay: "asc" },
          take: 1,
          select: { serviceDay: true },
        },
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
              // Ce que la facture porte ; le total commandé tant que rien n'est soldé.
              totalCents: row.billableTotalCents ?? row.totalCents,
              placedAt: row.createdAt,
              billedCompanyId: row.billedCompanyId,
              handedOver: row.handedOverAt !== null,
              // Le jour du solde (E6c2) : celui qui la fait entrer dans l'assiette.
              receivedOn: dayOf(row.settledOn),
              partiallyHandedOver: row.status === PARTIALLY_HANDED_OVER,
              remainderPlannedOn: dayOf(row.deliveryNotes[0]?.serviceDay ?? null),
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
