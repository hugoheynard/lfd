import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PeriodQuoteOrdersReader } from "../domain/ports/period-quote-orders.reader.js";
import type { InvoiceableOrder } from "../domain/services/monthly-invoicing.js";
import { INVOICEABLE_ORDER_SELECT, toInvoiceableOrder } from "./invoiceable-order.mapper.js";

/** Le statut d'une commande annulée (`orders.status`). */
const CANCELLED = "cancelled";

/**
 * Les commandes d'un devis de période, lues comme la clôture les lit
 * (`INVOICEABLE_ORDER_SELECT`), annulées retirées. Surface staff et abonné
 * de la comptabilité : le devis désigne ses commandes, le mur n'a pas de
 * société appelante à opposer.
 */
@Injectable()
export class PrismaPeriodQuoteOrdersReader extends PeriodQuoteOrdersReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async liveOrdersOf(orderIds: readonly string[]): Promise<readonly InvoiceableOrder[]> {
    const rows = await this.prisma.order.findMany({
      where: { id: { in: [...orderIds] }, status: { not: CANCELLED } },
      orderBy: [{ createdAt: "asc" }, { orderNumber: "asc" }],
      select: INVOICEABLE_ORDER_SELECT,
    });
    return rows.flatMap((row) =>
      row.companyId === null ? [] : [toInvoiceableOrder(row, row.companyId)],
    );
  }
}
