import {
  InvalidCreditNoteError,
  InvalidInvoiceError,
  InvoiceAssemblyError,
} from "../errors/invoice-errors.js";
import type { InvoiceNumber } from "../value-objects/invoice-number.js";
import { assertCalendarDate } from "./invoice-invariants.js";
import {
  COMMERCIAL_INVOICE,
  type InvoiceOrderReference,
  type InvoiceState,
} from "./invoice.types.js";

/** Ce qu'un avoir à émettre dit de lui-même, face à la facture qu'il corrige. */
export interface CreditNoteClaim {
  readonly number: InvoiceNumber;
  readonly issuedOn: string;
  /** La facture que chacun des avoirs antérieurs cités corrige. */
  readonly priorCorrectedIds: readonly (string | null)[];
  readonly orders: readonly InvoiceOrderReference[];
}

/**
 * Les contrôles de FORME de la facture — dates, bons, pièce corrigeable —
 * sortis de `invoice.ts` pour qu'il reste sous 300 lignes (lot E5a). Aucun
 * autre appelant que les factories de `Invoice`.
 */

/** Numéro de l'année d'émission ; échéance au plus tôt le jour d'émission. */
export function assertDates(number: InvoiceNumber, issuedOn: string, dueOn: string | null): void {
  assertCalendarDate("date d'émission", issuedOn);
  if (issuedOn.slice(0, 4) !== String(number.year)) {
    throw new InvoiceAssemblyError(
      number.value,
      `numéro d'une autre année que l'émission (${issuedOn})`,
    );
  }
  if (dueOn !== null) {
    assertCalendarDate("date d'échéance", dueOn);
    if (dueOn < issuedOn) {
      throw new InvalidInvoiceError(
        "date d'échéance",
        `le ${dueOn} précède l'émission du ${issuedOn}`,
      );
    }
  }
}

export function assertOrders(orders: readonly InvoiceOrderReference[]): void {
  const ids = new Set(orders.map((order) => order.orderId));
  if (ids.size !== orders.length) {
    throw new InvalidInvoiceError("bons", "un bon cité deux fois");
  }
  for (const order of orders) {
    if (order.reference.trim() === "") {
      throw new InvalidInvoiceError("bons", "un bon sans référence ne se cite pas (BT-13)");
    }
    if (order.deliveredOn !== null) {
      assertCalendarDate(`livraison du bon ${order.reference}`, order.deliveredOn);
    }
  }
}

export function assertCorrectable(corrected: InvoiceState, input: CreditNoteClaim): void {
  const fail = (reason: string): never => {
    throw new InvalidCreditNoteError(corrected.number, reason);
  };
  if (corrected.type !== COMMERCIAL_INVOICE) {
    fail("un avoir corrige une facture, pas un avoir");
  }
  if (input.issuedOn < corrected.issuedOn) {
    fail(`l'avoir du ${input.issuedOn} précède la facture du ${corrected.issuedOn}`);
  }
  if (input.number.value === corrected.number) {
    fail("l'avoir reprend le numéro de la facture");
  }
  if (input.priorCorrectedIds.some((id) => id !== corrected.id)) {
    fail("un avoir antérieur cité corrige une autre facture");
  }
  const invoicedIds = new Set(corrected.orders.map((order) => order.orderId));
  if (input.orders.some((order) => !invoicedIds.has(order.orderId))) {
    fail("un bon cité n'est pas sur la facture");
  }
}
