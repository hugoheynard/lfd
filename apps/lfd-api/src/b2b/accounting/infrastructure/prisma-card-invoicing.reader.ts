import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { COMMERCIAL_INVOICE } from "../domain/entities/invoice.types.js";
import { CardInvoicingReader } from "../domain/ports/card-invoicing.reader.js";
import type { CardInvoiceCandidate } from "../domain/services/card-invoicing.js";
import {
  FROZEN_INVOICE_ORDER_SELECT,
  toFrozenInvoiceOrder,
} from "./frozen-invoice-order.mapper.js";

/**
 * Ce que lit la facture carte (E5a) : la commande, ce qu'elle a figé, ses
 * remboursements réussis, et si une 380 la porte déjà. `invoice_order` n'a
 * pas de relation vers `orders` (l'id est opaque) : lectures séparées.
 *
 * Pas de mur tenant : l'appelant est un abonné durable ou une route staff
 * `b2b_accounting`, jamais un client ; la clé est l'id de la commande.
 */
@Injectable()
export class PrismaCardInvoicingReader extends CardInvoicingReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async candidate(orderId: string): Promise<CardInvoiceCandidate | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        ...FROZEN_INVOICE_ORDER_SELECT,
        id: true,
        companyId: true,
        billedCompanyId: true,
        clientele: true,
        status: true,
        paymentStatus: true,
        paidAt: true,
        handedOverAt: true,
        refunds: { where: { status: "succeeded" }, select: { amountCents: true } },
      },
    });
    if (order === null) {
      return null;
    }
    const [invoiced, follows] = await Promise.all([
      this.prisma.invoiceOrder.count({ where: { orderId, invoiceType: COMMERCIAL_INVOICE } }),
      this.followsOf(order.companyId),
    ]);
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      companyId: order.companyId,
      billedCompanyId: order.billedCompanyId,
      placedAt: order.createdAt,
      clientele: order.clientele,
      cancelled: order.status === "cancelled",
      paymentStatus: order.paymentStatus,
      totalCents: order.totalCents,
      paidAt: order.paidAt,
      handedOverAt: order.handedOverAt,
      invoiced: invoiced > 0,
      refundedCents: order.refunds.reduce((sum, refund) => sum + refund.amountCents, 0),
      follows,
      frozen: toFrozenInvoiceOrder(order),
    };
  }

  /** Les périodes `billing` de la société — `billedPayerOf` n'en lit qu'une. */
  private async followsOf(companyId: string | null): Promise<CardInvoiceCandidate["follows"]> {
    if (companyId === null) {
      return [];
    }
    const rows = await this.prisma.companyFollow.findMany({
      where: { companyId, aspect: "billing" },
      select: {
        companyId: true,
        parentId: true,
        validFrom: true,
        validTo: true,
        parent: { select: { raisonSociale: true } },
      },
    });
    return rows.map((row) => ({
      companyId: row.companyId,
      payerId: row.parentId,
      payerName: row.parent.raisonSociale,
      validFrom: row.validFrom,
      validTo: row.validTo,
    }));
  }
}
