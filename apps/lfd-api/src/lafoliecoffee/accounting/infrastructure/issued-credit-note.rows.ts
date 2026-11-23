import type { IssuedCreditNote } from "../domain/ports/issued-credit-notes.reader.js";

/** Les colonnes d'un avoir que l'export sert, et les bons qu'il nomme. */
export const ISSUED_CREDIT_NOTE_SELECT = {
  number: true,
  issuedOn: true,
  payerCompanyId: true,
  totalHtCents: true,
  totalVatCents: true,
  totalTtcCents: true,
  orders: { select: { orderNumber: true }, orderBy: { position: "asc" } },
} as const;

/** Un avoir lu, sous la forme que le `select` rend. */
export interface IssuedCreditNoteRow {
  readonly number: string;
  readonly issuedOn: Date;
  readonly payerCompanyId: string;
  readonly totalHtCents: number;
  readonly totalVatCents: number;
  readonly totalTtcCents: number;
  readonly orders: readonly { readonly orderNumber: string }[];
}

/** Ligne → avoir. `issued_on` est un `DATE` : son jour UTC est le jour écrit. */
export function issuedCreditNoteOf(row: IssuedCreditNoteRow): IssuedCreditNote {
  return {
    number: row.number,
    issuedOn: row.issuedOn.toISOString().slice(0, 10),
    payerCompanyId: row.payerCompanyId,
    totalHtCents: row.totalHtCents,
    totalVatCents: row.totalVatCents,
    totalTtcCents: row.totalTtcCents,
    orderNumbers: row.orders.map((order) => order.orderNumber),
  };
}
