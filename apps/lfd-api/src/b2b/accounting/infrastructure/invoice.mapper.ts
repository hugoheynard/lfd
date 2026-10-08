import type { z } from "zod";

import type { Prisma } from "../../../platform/database/client/client.js";
import { Invoice } from "../domain/entities/invoice.js";
import type { InvoiceState } from "../domain/entities/invoice.types.js";
import { UnreadableInvoiceError } from "../domain/errors/invoice-errors.js";
import { InvoiceNumber } from "../domain/value-objects/invoice-number.js";
import { buyerJson, sellerJson, vatBreakdownJson } from "./billing-statement-json.js";
import { vatBreakdownSchema } from "./billing-statement-json.schema.js";
import {
  addressLinesJson,
  INVOICE_BODY_VERSION,
  invoiceLinesJson,
  mentionsJson,
  paymentMeansJson,
} from "./invoice-json.js";
import {
  addressLinesSchema,
  invoiceBuyerSchema,
  invoiceLinesSchema,
  invoiceMentionsSchema,
  invoicePaymentMeansSchema,
  invoiceSellerSchema,
  invoiceTypeSchema,
} from "./invoice-json.schema.js";

/** Ce que la relecture charge : la ligne, ses bons, et le numéro de la facture corrigée. */
export const INVOICE_ROW_INCLUDE = {
  orders: { orderBy: { position: "asc" } },
  corrects: { select: { number: true } },
} as const satisfies Prisma.InvoiceInclude;

export type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_ROW_INCLUDE }>;

/** Un jour local écrit à minuit UTC : la colonne est un DATE, sans fuseau. */
function dayColumn(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function dayOf(column: Date): string {
  return column.toISOString().slice(0, 10);
}

/** Agrégat → données de création, bons compris. Le numéro se redécompose en année et rang. */
export function toInvoiceCreate(invoice: Invoice): Prisma.InvoiceUncheckedCreateInput {
  const state = invoice.toState();
  const number = InvoiceNumber.parse(state.number);
  return {
    id: state.id,
    legalEntityId: state.legalEntityId,
    number: state.number,
    year: number.year,
    rank: number.sequence,
    type: state.type,
    correctsInvoiceId: state.correctedInvoiceId,
    issuedOn: dayColumn(state.issuedOn),
    dueOn: state.dueOn === null ? null : dayColumn(state.dueOn),
    seller: sellerJson(state.seller),
    buyer: buyerJson(state.buyer),
    payerCompanyId: state.buyer.companyId,
    mentions: mentionsJson(state.mentions),
    lines: invoiceLinesJson(state.lines),
    vatBreakdown: vatBreakdownJson(state.vat),
    totalHtCents: state.vat.taxableBaseCents,
    totalVatCents: state.vat.vatCents,
    totalTtcCents: state.vat.totalCents,
    ...(state.deliveryAddressLines === null
      ? {}
      : { deliveryAddress: addressLinesJson(state.deliveryAddressLines) }),
    ...(state.paymentMeans === null ? {} : { paymentMeans: paymentMeansJson(state.paymentMeans) }),
    bodyVersion: INVOICE_BODY_VERSION,
    documentKey: state.documentKey,
    documentSha256: state.documentSha256,
    orders: {
      create: state.orders.map((order, position) => ({
        position,
        orderId: order.orderId,
        orderNumber: order.reference,
        deliveredOn: order.deliveredOn === null ? null : dayColumn(order.deliveredOn),
      })),
    },
  };
}

/**
 * Ligne → agrégat, par `Invoice.restore` (forme et totaux revalidés).
 *
 * @throws {UnreadableInvoiceError} forme inconnue, ou JSON hors schéma.
 */
export function toInvoice(row: InvoiceRow): Invoice {
  if (row.bodyVersion !== INVOICE_BODY_VERSION) {
    throw new UnreadableInvoiceError(row.id, `forme ${String(row.bodyVersion)} inconnue`);
  }
  return Invoice.restore(toInvoiceState(row));
}

function toInvoiceState(row: InvoiceRow): InvoiceState {
  const read = <T>(schema: z.ZodType<T>, value: unknown, field: string): T => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new UnreadableInvoiceError(row.id, `colonne ${field} hors schéma`);
    }
    return parsed.data;
  };
  return {
    id: row.id,
    number: row.number,
    type: read(invoiceTypeSchema, row.type, "type"),
    correctedInvoiceId: row.correctsInvoiceId,
    correctedInvoiceNumber: row.corrects?.number ?? null,
    legalEntityId: row.legalEntityId,
    issuedOn: dayOf(row.issuedOn),
    dueOn: row.dueOn === null ? null : dayOf(row.dueOn),
    seller: read(invoiceSellerSchema, row.seller, "seller"),
    buyer: read(invoiceBuyerSchema, row.buyer, "buyer"),
    deliveryAddressLines:
      row.deliveryAddress === null
        ? null
        : read(addressLinesSchema, row.deliveryAddress, "delivery_address"),
    orders: row.orders.map((order) => ({
      orderId: order.orderId,
      reference: order.orderNumber,
      deliveredOn: order.deliveredOn === null ? null : dayOf(order.deliveredOn),
    })),
    lines: read(invoiceLinesSchema, row.lines, "lines"),
    vat: read(vatBreakdownSchema, row.vatBreakdown, "vat_breakdown"),
    mentions: read(invoiceMentionsSchema, row.mentions, "mentions"),
    paymentMeans:
      row.paymentMeans === null
        ? null
        : read(invoicePaymentMeansSchema, row.paymentMeans, "payment_means"),
    documentKey: row.documentKey,
    documentSha256: row.documentSha256,
  };
}
