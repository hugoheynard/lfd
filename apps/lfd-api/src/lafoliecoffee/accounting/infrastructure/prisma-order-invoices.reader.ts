import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { Invoice } from "../domain/entities/invoice.js";
import { OrderInvoicesReader } from "../domain/ports/order-invoices.reader.js";
import { INVOICE_ROW_INCLUDE, toInvoice } from "./invoice.mapper.js";

/**
 * Les pièces d'une commande, par `invoice_order` : la 380 qui porte le bon et
 * les avoirs qui le citent (un avoir de remboursement cite son bon, E5b).
 *
 * Pas de mur tenant : lu par le rapprochement (abonné durable) et par une
 * route staff `b2b_accounting` — aucun client ne passe par ici.
 */
@Injectable()
export class PrismaOrderInvoicesReader extends OrderInvoicesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofOrder(orderId: string): Promise<readonly Invoice[]> {
    const rows = await this.prisma.invoice.findMany({
      where: { orders: { some: { orderId } } },
      include: INVOICE_ROW_INCLUDE,
      orderBy: [{ year: "asc" }, { rank: "asc" }],
    });
    return rows.map(toInvoice);
  }
}
