import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { COMMERCIAL_INVOICE } from "../domain/entities/invoice.types.js";
import { MonthlyInvoicingReader } from "../domain/ports/monthly-invoicing.reader.js";
import type { BillingFollow } from "../domain/ports/statement-billing.reader.js";
import { invoiceGroupKey, type InvoiceableOrder } from "../domain/services/monthly-invoicing.js";
import type { CollectionFormName } from "../domain/value-objects/collection-form.js";
import { budgetCommitmentOf } from "../domain/value-objects/invoice-budget-commitment.js";
import { billableOrderWhere, unsettledWhere } from "./billable-order-criterion.js";
import { INVOICEABLE_ORDER_SELECT, toInvoiceableOrder } from "./invoiceable-order.mapper.js";
import { ISSUED_OUTCOME, mandateIdOfColumn } from "./prisma-monthly-invoice-outcomes.js";
import { AWAITING_QUOTE_STATE } from "./prisma-period-quote.repository.js";

/**
 * Un compte ouvert au comptoir n'est pas un payeur du mois tant que le
 * commerce ne l'a pas converti (`plan-comptes-du-comptoir.md`, § 6.2) : sans
 * SIREN ni adresse, il bloquerait la clôture des autres. Écarté ici, par son
 * statut, dans la requête.
 */
const MONTHLY_PAYER_COMPANY = {
  status: { not: "counter_opened" },
} as const satisfies Prisma.CompanyWhereInput;

/**
 * Ce que lit la facture du mois (E4). L'assiette est `billableOrderWhere`,
 * écrite une fois et partagée avec le relevé et le lot ; `invoice_order`
 * n'a pas de relation vers `orders` (l'id est opaque) : deux lectures,
 * jointes en mémoire — c'est ici que « jamais facturé » se juge (lot ZL).
 */
@Injectable()
export class PrismaMonthlyInvoicingReader extends MonthlyInvoicingReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async invoicingFloor(): Promise<Date | null> {
    const row = await this.prisma.invoicingFloor.findFirst({ where: { id: true } });
    return row?.floorAt ?? null;
  }

  async uninvoicedOrders(from: Date, to: Date): Promise<readonly InvoiceableOrder[]> {
    const orders = await this.prisma.order.findMany({
      // Les bons remis mais pas soldés sont lus AUSSI, marqués : le bloqueur
      // d'émission les nomme au lieu de les taire (plan E6c2, § 1).
      where: {
        OR: [billableOrderWhere(from, to), unsettledWhere(from, to)],
        company: MONTHLY_PAYER_COMPANY,
      },
      orderBy: [{ createdAt: "asc" }, { orderNumber: "asc" }],
      select: INVOICEABLE_ORDER_SELECT,
    });
    const ids = orders.map((order) => order.id);
    const [invoiced, quoted] = await Promise.all([
      this.prisma.invoiceOrder.findMany({
        where: { orderId: { in: ids }, invoiceType: COMMERCIAL_INVOICE },
        select: { orderId: true },
      }),
      // Rangée dans un devis de période en attente (P2 bis) : sa facture
      // naîtra du devis, la période suivante ne la reprend pas. Un devis
      // facturé n'a pas à être lu : sa facture porte déjà ses commandes.
      this.prisma.periodQuoteOrder.findMany({
        where: { orderId: { in: ids }, quoteState: AWAITING_QUOTE_STATE },
        select: { orderId: true },
      }),
    ]);
    const taken = new Set([...invoiced, ...quoted].map((row) => row.orderId));
    return orders.flatMap((order) =>
      order.companyId === null || taken.has(order.id)
        ? []
        : [toInvoiceableOrder(order, order.companyId)],
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

  async invoicedGroups(legalEntityId: string, periodClosesAt: Date): Promise<ReadonlySet<string>> {
    const rows = await this.prisma.invoiceMonthlyOutcome.findMany({
      where: { legalEntityId, periodClosesAt, outcome: ISSUED_OUTCOME },
      select: {
        payerCompanyId: true,
        mandateId: true,
        budgetCommitmentNumber: true,
        budgetCommitmentServiceCode: true,
      },
    });
    return new Set(
      rows.map((row) =>
        invoiceGroupKey(
          row.payerCompanyId,
          mandateIdOfColumn(row.mandateId),
          budgetCommitmentOf(row.budgetCommitmentNumber, row.budgetCommitmentServiceCode),
        ),
      ),
    );
  }
}
