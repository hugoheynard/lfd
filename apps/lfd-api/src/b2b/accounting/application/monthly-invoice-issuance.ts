import type { CreditorSnapshot } from "../domain/creditor-snapshot.js";
import { statementSellerOf } from "../domain/entities/billing-statement.js";
import type { MonthlyInvoiceOutcomeKey } from "../domain/ports/monthly-invoice-outcomes.js";
import type { BillingCycle } from "../domain/services/billing-cycle.js";
import { invoiceFromDossier } from "../domain/services/invoice-from-dossier.js";
import type { InvoiceSellerFacts } from "../domain/services/invoice-issuance-blockers.js";
import { simulateInvoiceDossier } from "../domain/services/invoice-dossier.js";
import type { MonthlyInvoiceReport } from "../domain/services/monthly-invoice-report.js";
import {
  invoicePaymentMeansOf,
  type PayerInvoicePlan,
} from "../domain/services/monthly-invoicing.js";
import type { MonthlyContext } from "./monthly-invoice-support.js";

/**
 * Les pièces pures d'un passage de la facture par période
 * (`IssueMonthlyInvoicesHandler`) : ce qu'il fige une fois, la facture d'un
 * payeur, sa clé d'issue, et le rapport. Sorties du handler pour qu'il
 * n'orchestre que les lectures et les transactions.
 */

/** Ce qui ne change pas d'un payeur à l'autre dans un passage. */
export interface Issuance {
  readonly legalEntityId: string;
  readonly period: BillingCycle;
  readonly periodLabel: string;
  readonly issuedOn: string;
  readonly dueOn: string;
  readonly creditor: CreditorSnapshot;
  readonly sellerFacts: InvoiceSellerFacts;
  readonly context: MonthlyContext;
  readonly at: Date;
}

export type PayerIssue =
  | {
      readonly kind: "issued";
      readonly payerCompanyId: string;
      readonly number: string;
      readonly issuedOn: string;
    }
  | { readonly kind: "blocked"; readonly payerCompanyId: string; readonly message: string };

/** La facture d'un payeur, une fois son numéro réservé — rien n'y est recalculé. */
export function draftOf(
  payer: PayerInvoicePlan,
  issuance: Issuance,
  id: string,
  number: Parameters<typeof invoiceFromDossier>[0]["number"],
): ReturnType<typeof invoiceFromDossier> {
  const { context } = issuance;
  return invoiceFromDossier({
    id,
    number,
    issuedOn: issuance.issuedOn,
    dueOn: issuance.dueOn,
    sellerFacts: issuance.sellerFacts,
    seller: statementSellerOf(issuance.creditor),
    buyer: context.buyers.get(payer.payerId) ?? null,
    // L'adresse de livraison n'est pas figée par bon : aucune n'est imprimée
    // plutôt qu'une parmi plusieurs (rapport du lot E4).
    deliveryAddressLines: null,
    orders: payer.billable.map((order) => ({
      orderId: order.orderId,
      reference: order.orderNumber,
      deliveredOn: context.deliveredOn.get(order.orderId) ?? null,
    })),
    paymentMeans: invoicePaymentMeansOf(payer.mandate),
    // Rien n'est payé d'avance sur un bon au compte : il sera prélevé.
    prepayment: null,
    computed: simulateInvoiceDossier(payer.billable.map((order) => order.frozen)).invoice,
  });
}

export function outcomeKey(payer: PayerInvoicePlan, issuance: Issuance): MonthlyInvoiceOutcomeKey {
  return {
    legalEntityId: issuance.legalEntityId,
    periodClosesAt: issuance.period.closesAt,
    payerCompanyId: payer.payerId,
    payerName: issuance.context.names.get(payer.payerId) ?? payer.payerId,
    mandateId: payer.mandate?.mandateId ?? null,
    mandateReference: payer.mandate?.reference ?? null,
    unbillableOrders: payer.unbillable.map((order) => order.orderNumber),
    at: issuance.at,
  };
}

export function report(
  issuance: Issuance,
  issues: readonly PayerIssue[],
  alreadyInvoiced: number,
  invoices: readonly PayerInvoicePlan[],
): MonthlyInvoiceReport {
  return {
    periodClosesAt: issuance.period.closesAt.toISOString(),
    periodStartsAt: issuance.period.startsAt.toISOString(),
    periodLabel: issuance.periodLabel,
    issued: issues.flatMap((issue) =>
      issue.kind === "issued"
        ? [{ payerCompanyId: issue.payerCompanyId, number: issue.number, issuedOn: issue.issuedOn }]
        : [],
    ),
    blocked: issues.flatMap((issue) =>
      issue.kind === "blocked"
        ? [{ payerCompanyId: issue.payerCompanyId, message: issue.message }]
        : [],
    ),
    alreadyInvoiced,
    unbillableOrders: invoices.reduce((sum, invoice) => sum + invoice.unbillable.length, 0),
  };
}

/** Le plus tard de deux jours `AAAA-MM-JJ`. */
export function later(left: string, right: string): string {
  return left >= right ? left : right;
}
