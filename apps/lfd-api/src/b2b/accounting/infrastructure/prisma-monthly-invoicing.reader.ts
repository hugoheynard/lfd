import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { COMMERCIAL_INVOICE } from "../domain/entities/invoice.types.js";
import { MonthlyInvoicingReader } from "../domain/ports/monthly-invoicing.reader.js";
import type { BillingFollow } from "../domain/ports/statement-billing.reader.js";
import { invoiceGroupKey, type InvoiceableOrder } from "../domain/services/monthly-invoicing.js";
import type { CollectionFormName } from "../domain/value-objects/collection-form.js";
import { billableOrderWhere } from "./billable-order-criterion.js";
import {
  FROZEN_INVOICE_ORDER_SELECT,
  toFrozenInvoiceOrder,
} from "./frozen-invoice-order.mapper.js";
import { ISSUED_OUTCOME, mandateIdOfColumn } from "./prisma-monthly-invoice-outcomes.js";

/**
 * Ce que lit la facture du mois (E4). L'assiette est `billableOrderWhere`,
 * écrite une fois et partagée avec le relevé et le lot ; `invoice_order`
 * n'a pas de relation vers `orders` (l'id est opaque) : deux lectures,
 * jointes en mémoire.
 */
@Injectable()
export class PrismaMonthlyInvoicingReader extends MonthlyInvoicingReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async invoicingFloor(): Promise<Date | null> {
    const row = await this.prisma.invoicingFloor.findUnique({ where: { id: true } });
    return row?.floorAt ?? null;
  }

  async uninvoicedOrders(from: Date, to: Date): Promise<readonly InvoiceableOrder[]> {
    const orders = await this.prisma.order.findMany({
      where: billableOrderWhere(from, to),
      orderBy: [{ createdAt: "asc" }, { orderNumber: "asc" }],
      select: { ...FROZEN_INVOICE_ORDER_SELECT, id: true, companyId: true, billedCompanyId: true },
    });
    const invoiced = await this.prisma.invoiceOrder.findMany({
      where: {
        orderId: { in: orders.map((order) => order.id) },
        invoiceType: COMMERCIAL_INVOICE,
      },
      select: { orderId: true },
    });
    const taken = new Set(invoiced.map((row) => row.orderId));
    return orders.flatMap((order) =>
      order.companyId === null || taken.has(order.id)
        ? []
        : [
            {
              orderId: order.id,
              orderNumber: order.orderNumber,
              companyId: order.companyId,
              placedAt: order.createdAt,
              billedCompanyId: order.billedCompanyId,
              frozen: toFrozenInvoiceOrder(order),
            },
          ],
    );
  }

  async billingFollowsOf(companyIds: readonly string[]): Promise<readonly BillingFollow[]> {
    const rows = await this.prisma.companyFollow.findMany({
      where: { companyId: { in: [...companyIds] }, aspect: "billing" },
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

  async collectionFormsAt(
    companyIds: readonly string[],
    at: Date,
  ): Promise<ReadonlyMap<string, CollectionFormName>> {
    const rows = await this.prisma.companyCollectionForm.findMany({
      where: {
        companyId: { in: [...companyIds] },
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
      select: { companyId: true, form: true },
    });
    return new Map(rows.map((row) => [row.companyId, row.form]));
  }

  async companyNames(companyIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const rows = await this.prisma.company.findMany({
      where: { id: { in: [...companyIds] } },
      select: { id: true, raisonSociale: true },
    });
    return new Map(rows.map((row) => [row.id, row.raisonSociale]));
  }

  async invoicedGroups(legalEntityId: string, month: string): Promise<ReadonlySet<string>> {
    const rows = await this.prisma.invoiceMonthlyOutcome.findMany({
      where: { legalEntityId, month, outcome: ISSUED_OUTCOME },
      select: { payerCompanyId: true, mandateId: true },
    });
    return new Set(
      rows.map((row) => invoiceGroupKey(row.payerCompanyId, mandateIdOfColumn(row.mandateId))),
    );
  }
}
