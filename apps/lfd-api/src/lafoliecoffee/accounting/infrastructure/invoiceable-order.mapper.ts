import type { Prisma } from "../../../platform/database/client/client.js";
import type { InvoiceableOrder } from "../domain/services/monthly-invoicing.js";
import { budgetCommitmentOf } from "../domain/value-objects/invoice-budget-commitment.js";
import {
  BILLABLE_INVOICE_ORDER_SELECT,
  handedOverNoteNumbersOf,
  toBillableInvoiceOrder,
} from "./billable-invoice-order.mapper.js";
import { AWAITING_REMAINDER_SELECT, awaitsRemainder } from "./billable-order-criterion.js";
import { toFrozenInvoiceOrder } from "./frozen-invoice-order.mapper.js";
import {
  INVOICE_ORDER_FREE_DELIVERY_SELECT,
  freeDeliveryFieldOf,
} from "./invoice-free-delivery.columns.js";

/** `AAAA-MM-JJ`. */
const DAY_LENGTH = 10;

/**
 * Ce qu'une commande à facturer lit en base — partagé par la clôture
 * (`uninvoicedOrders`) et le devis de période (`PeriodQuoteOrdersReader`) :
 * l'empreinte d'un devis se recalcule sur la même lecture que celle qui l'a
 * rangé, sans quoi deux lectures des mêmes commandes différeraient.
 */
export const INVOICEABLE_ORDER_SELECT = {
  ...BILLABLE_INVOICE_ORDER_SELECT,
  ...INVOICE_ORDER_FREE_DELIVERY_SELECT,
  id: true,
  companyId: true,
  billedCompanyId: true,
  receivedOn: true,
  ...AWAITING_REMAINDER_SELECT,
  shortfallDecisions: { select: { id: true, remainder: true } },
  budgetCommitmentNumber: true,
  budgetCommitmentServiceCode: true,
} as const satisfies Prisma.OrderSelect;

type InvoiceableOrderRow = Prisma.OrderGetPayload<{ select: typeof INVOICEABLE_ORDER_SELECT }>;

/** La ligne → la commande à facturer, sa société (non nulle) donnée par l'appelant. */
export function toInvoiceableOrder(
  order: InvoiceableOrderRow,
  companyId: string,
): InvoiceableOrder {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    companyId,
    placedAt: order.createdAt,
    // `@db.Date` : minuit UTC, dont la date ISO EST le jour de Paris.
    receivedOn: order.receivedOn?.toISOString().slice(0, DAY_LENGTH) ?? null,
    billedCompanyId: order.billedCompanyId,
    deliveryNoteNumbers: handedOverNoteNumbersOf(order),
    ...freeDeliveryFieldOf(order),
    budgetCommitment: budgetCommitmentOf(
      order.budgetCommitmentNumber,
      order.budgetCommitmentServiceCode,
    ),
    // Non soldé : la facture de son payeur ne part pas (bloqueur) ; le
    // dossier montré en attendant est celui de la commande.
    ...(order.billableTotalCents === null
      ? {
          settlement: awaitsRemainder(order) ? "awaiting_remainder" : "unsettled",
          frozen: toFrozenInvoiceOrder(order),
        }
      : { frozen: toBillableInvoiceOrder(order) }),
  };
}
