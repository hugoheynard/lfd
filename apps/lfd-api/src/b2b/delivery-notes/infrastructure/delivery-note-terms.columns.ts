import { orderRatesAmountsSchema } from "@lfd/contracts";

import { Prisma } from "../../../platform/database/client/client.js";
import type { OrderRateAmounts } from "../../orders/domain/value-objects/order-rate-amounts.js";
import type {
  DeliveryNoteTerms,
  DeliveryNoteTtcTerms,
  FrozenJson,
} from "../domain/value-objects/delivery-note-terms.js";

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
  readonly vatMethod: string;
  readonly discountTtcCents: number | null;
  readonly voucherTtcCents: number | null;
  readonly deliveryFeeTtcCents: number | null;
  readonly ttcByRate: Prisma.JsonValue;
}

const LINE_HT = "line_ht";
const EXACT_HT = "exact_ht";

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
    ttcTerms: ttcTermsOf(row),
  };
}

/** Un JSON nul s'écrit `NULL` en base (`DbNull`), pas la valeur JSON `null`. */
function jsonColumn(value: FrozenJson | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : value;
}

/** En-tête → colonnes ; un BL sans en-tête écrit dix `NULL`, et la méthode `line_ht`. */
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
    ...vatMethodColumns(terms),
  };
}

/** La part de chaque taux → JSON ; `null` s'écrit `NULL` en base. */
function byRateJson(parts: readonly OrderRateAmounts[] | null): FrozenJson | null {
  return parts === null
    ? null
    : parts.map((part) => ({
        rate: part.rate,
        htCents: part.htCents,
        vatCents: part.vatCents,
        ttcCents: part.ttcCents,
      }));
}

/** Les TTC relus d'un BL ; le CHECK `delivery_note_ttc_terms_iff_exact_ht` les tient ensemble. */
function ttcTermsOf(row: DeliveryNoteTermsRow): DeliveryNoteTtcTerms | null {
  const { vatMethod, discountTtcCents, voucherTtcCents, deliveryFeeTtcCents } = row;
  if (
    vatMethod !== EXACT_HT ||
    discountTtcCents === null ||
    voucherTtcCents === null ||
    deliveryFeeTtcCents === null
  ) {
    return null;
  }
  return {
    discountCents: discountTtcCents,
    voucherCents: voucherTtcCents,
    deliveryFeeCents: deliveryFeeTtcCents,
    byRate: byRateOf(row.ttcByRate),
  };
}

/** La part de chaque taux relue ; une forme inconnue (écrite hors de l'application) se tait. */
function byRateOf(value: Prisma.JsonValue): readonly OrderRateAmounts[] | null {
  const parsed = orderRatesAmountsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * La méthode et les TTC d'un BL (`delivery_note.vat_method`, migration
 * `20261027130000`, plan `documentation/pricing/plan-centime-particuliers.md`,
 * § 7) : `exact_ht` et ses trois TTC, ou `line_ht` et trois `NULL`. Un BL sans
 * en-tête (d'avant E4a) est `line_ht` — la colonne est non nulle.
 */
function vatMethodColumns(terms: DeliveryNoteTerms | null) {
  const ttc = terms?.ttcTerms ?? null;
  return {
    vatMethod: ttc === null ? LINE_HT : EXACT_HT,
    discountTtcCents: ttc?.discountCents ?? null,
    voucherTtcCents: ttc?.voucherCents ?? null,
    deliveryFeeTtcCents: ttc?.deliveryFeeCents ?? null,
    ttcByRate: jsonColumn(byRateJson(ttc?.byRate ?? null)),
  };
}
