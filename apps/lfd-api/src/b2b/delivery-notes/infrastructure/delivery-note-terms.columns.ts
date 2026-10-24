import { Prisma } from "../../../platform/database/client/client.js";
import type { DeliveryNoteTerms, FrozenJson } from "../domain/value-objects/delivery-note-terms.js";

/** Les colonnes d'en-tête d'un BL, telles que Prisma les relit. */
export interface DeliveryNoteTermsRow {
  readonly subtotalCents: number | null;
  readonly discountCents: number | null;
  readonly voucherDiscountCents: number | null;
  readonly deliveryFeeCents: number | null;
  readonly deliveryVatMode: string | null;
  readonly lateFeeCents: number | null;
  readonly lateFeeAdjustment: Prisma.JsonValue;
  readonly vatShares: Prisma.JsonValue;
  readonly vatCents: number | null;
  readonly totalCents: number | null;
}

/**
 * Ligne → en-tête. `total_cents` nul = BL d'avant E4a : le CHECK « tout ou
 * rien » (`20261024230000`) garantit qu'alors les sept entiers le sont.
 */
export function termsOf(row: DeliveryNoteTermsRow): DeliveryNoteTerms | null {
  const { subtotalCents, discountCents, voucherDiscountCents, deliveryFeeCents } = row;
  const { lateFeeCents, vatCents, totalCents } = row;
  if (
    subtotalCents === null ||
    discountCents === null ||
    voucherDiscountCents === null ||
    deliveryFeeCents === null ||
    lateFeeCents === null ||
    vatCents === null ||
    totalCents === null
  ) {
    return null;
  }
  return {
    subtotalCents,
    discountCents,
    voucherDiscountCents,
    deliveryFeeCents,
    deliveryVatMode: row.deliveryVatMode,
    lateFeeCents,
    lateFeeAdjustment: row.lateFeeAdjustment,
    vatShares: row.vatShares,
    vatCents,
    totalCents,
  };
}

/** Un JSON nul s'écrit `NULL` en base (`DbNull`), pas la valeur JSON `null`. */
function jsonColumn(value: FrozenJson | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : value;
}

/** En-tête → colonnes ; un BL sans en-tête écrit dix `NULL`. */
export function termsColumns(terms: DeliveryNoteTerms | null) {
  return {
    subtotalCents: terms?.subtotalCents ?? null,
    discountCents: terms?.discountCents ?? null,
    voucherDiscountCents: terms?.voucherDiscountCents ?? null,
    deliveryFeeCents: terms?.deliveryFeeCents ?? null,
    deliveryVatMode: terms?.deliveryVatMode ?? null,
    lateFeeCents: terms?.lateFeeCents ?? null,
    lateFeeAdjustment: jsonColumn(terms?.lateFeeAdjustment ?? null),
    vatShares: jsonColumn(terms?.vatShares ?? null),
    vatCents: terms?.vatCents ?? null,
    totalCents: terms?.totalCents ?? null,
  };
}
