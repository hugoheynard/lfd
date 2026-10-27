import {
  cartAdjustmentSchema,
  deliveryVatModeSchema,
  lateFeeAdjustmentSchema,
  orderRatesAmountsSchema,
  vatSharesSchema,
} from "@lfd/contracts";

import { Prisma } from "../../../platform/database/client/client.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type { BillableAmounts } from "../domain/entities/billable-amounts.js";
import type { OrderRateAmounts } from "../domain/value-objects/order-rate-amounts.js";
import type {
  FrozenExactTerms,
  FrozenOrderAdjustments,
} from "../domain/ports/shortfall-decision.reader.js";
import { asOrderVatMethod, type OrderVatMethod } from "../domain/value-objects/order-vat-method.js";

/**
 * Les colonnes d'argent d'`orders` lues et écrites par le départ incomplet
 * (lots E6b, E6c1) : les règles figées, les totaux, les montants facturables.
 * Une seule traduction, pour que la décision, le BL partiel et le solde lisent
 * la même chose.
 */

/** Une colonne JSON d'ajustement que la passation n'a pas pu écrire ainsi. */
export class FrozenAdjustmentUnreadableError extends TechnicalError {
  constructor(orderId: string, column: string) {
    super(
      "orders.frozen_adjustment.unreadable",
      `La règle figée « ${column} » de la commande ${orderId} est illisible : la colonne a été écrite hors de l'application. ` +
        "Le bon de livraison partiel n'a pas été recomposé ; signalez-le à l'équipe technique.",
    );
  }
}

/** Les colonnes des règles figées, telles que Prisma les relit. */
export const FROZEN_ADJUSTMENT_SELECT = {
  discountAdjustment: true,
  deliveryFeeAdjustment: true,
  lateFeeAdjustment: true,
  deliveryVatMode: true,
  vatMethod: true,
  voucherTtcCents: true,
  deliveryFeeTtcCents: true,
} as const;

interface FrozenAdjustmentRow {
  readonly discountAdjustment: Prisma.JsonValue;
  readonly deliveryFeeAdjustment: Prisma.JsonValue;
  readonly lateFeeAdjustment: Prisma.JsonValue;
  readonly deliveryVatMode: string | null;
  readonly vatMethod: string;
  readonly voucherTtcCents: number | null;
  readonly deliveryFeeTtcCents: number | null;
}

function parsed<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  value: unknown,
  orderId: string,
  column: string,
): T | null {
  if (value === null) {
    return null;
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new FrozenAdjustmentUnreadableError(orderId, column);
  }
  return result.data;
}

/** @throws {FrozenAdjustmentUnreadableError} */
export function frozenAdjustmentsOf(
  orderId: string,
  row: FrozenAdjustmentRow,
): FrozenOrderAdjustments {
  return {
    discount: parsed(cartAdjustmentSchema, row.discountAdjustment, orderId, "remise"),
    deliveryFee: parsed(cartAdjustmentSchema, row.deliveryFeeAdjustment, orderId, "frais"),
    lateFee: parsed(lateFeeAdjustmentSchema, row.lateFeeAdjustment, orderId, "surtaxe"),
    deliveryVatMode: parsed(deliveryVatModeSchema, row.deliveryVatMode, orderId, "TVA du port"),
    exact: frozenExactTermsOf(orderId, row),
  };
}

/**
 * Les TTC figés d'une commande `exact_ht`. Le CHECK
 * `orders_ttc_terms_iff_exact_ht` les garantit non nuls ensemble ; un nul ici
 * est une colonne écrite hors de l'application.
 *
 * @throws {UnknownOrderVatMethodError}
 * @throws {FrozenAdjustmentUnreadableError}
 */
function frozenExactTermsOf(orderId: string, row: FrozenAdjustmentRow): FrozenExactTerms | null {
  if (vatMethodOf(orderId, row.vatMethod) === "line_ht") {
    return null;
  }
  if (row.voucherTtcCents === null || row.deliveryFeeTtcCents === null) {
    throw new FrozenAdjustmentUnreadableError(orderId, "montants taxe comprise");
  }
  return { voucherTtcCents: row.voucherTtcCents, deliveryFeeTtcCents: row.deliveryFeeTtcCents };
}

/** Les totaux de la commande. */
export const ORDER_AMOUNTS_SELECT = {
  subtotalCents: true,
  discountCents: true,
  voucherDiscountCents: true,
  deliveryFeeCents: true,
  lateFeeCents: true,
  vatCents: true,
  vatShares: true,
  totalCents: true,
} as const;

/** Les montants facturables posés (E6c1). */
export const BILLABLE_SELECT = {
  billableSubtotalCents: true,
  billableDiscountCents: true,
  billableVoucherDiscountCents: true,
  billableDeliveryFeeCents: true,
  billableLateFeeCents: true,
  billableVatCents: true,
  billableVatShares: true,
  billableTotalCents: true,
  settledOn: true,
} as const;

interface OrderAmountsRow {
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly voucherDiscountCents: number;
  readonly deliveryFeeCents: number;
  readonly lateFeeCents: number;
  readonly vatCents: number;
  readonly vatShares: Prisma.JsonValue;
  readonly totalCents: number;
}

interface BillableRow {
  readonly billableSubtotalCents: number | null;
  readonly billableDiscountCents: number | null;
  readonly billableVoucherDiscountCents: number | null;
  readonly billableDeliveryFeeCents: number | null;
  readonly billableLateFeeCents: number | null;
  readonly billableVatCents: number | null;
  readonly billableVatShares: Prisma.JsonValue;
  readonly billableTotalCents: number | null;
}

/** La ventilation figée, ou `null` (commande d'avant la colonne, ou forme inconnue). */
function sharesOf(value: Prisma.JsonValue): BillableAmounts["vatShares"] {
  const result = vatSharesSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function orderAmountsOf(row: OrderAmountsRow): BillableAmounts {
  return { ...row, vatShares: sharesOf(row.vatShares) };
}

/** `null` si rien n'est posé — le CHECK « tout ou rien » garantit les sept ensemble. */
export function billableOf(row: BillableRow): BillableAmounts | null {
  const total = row.billableTotalCents;
  if (total === null) {
    return null;
  }
  return {
    subtotalCents: row.billableSubtotalCents ?? 0,
    discountCents: row.billableDiscountCents ?? 0,
    voucherDiscountCents: row.billableVoucherDiscountCents ?? 0,
    deliveryFeeCents: row.billableDeliveryFeeCents ?? 0,
    lateFeeCents: row.billableLateFeeCents ?? 0,
    vatCents: row.billableVatCents ?? 0,
    vatShares: sharesOf(row.billableVatShares),
    totalCents: total,
  };
}

/** Les montants facturables → colonnes ; la ventilation absente s'écrit `NULL`. */
export function billableColumns(amounts: BillableAmounts, settledOn: string) {
  return {
    billableSubtotalCents: amounts.subtotalCents,
    billableDiscountCents: amounts.discountCents,
    billableVoucherDiscountCents: amounts.voucherDiscountCents,
    billableDeliveryFeeCents: amounts.deliveryFeeCents,
    billableLateFeeCents: amounts.lateFeeCents,
    billableVatCents: amounts.vatCents,
    billableVatShares:
      amounts.vatShares === null
        ? Prisma.DbNull
        : amounts.vatShares.map((share) => ({ rate: share.rate, amountCents: share.amountCents })),
    billableTotalCents: amounts.totalCents,
    settledOn: new Date(`${settledOn}T00:00:00.000Z`),
  };
}

/** Un `DATE` → `AAAA-MM-JJ` (son jour UTC est le jour écrit). */
export function dayOf(date: Date | null): string | null {
  return date === null ? null : date.toISOString().slice(0, 10);
}

/**
 * La méthode de TVA et les TTC des termes, tels que l'agrégat les a figés
 * (plan `documentation/pricing/plan-centime-particuliers.md`, § 7) — écrits
 * par la passation et par la révision, de la même façon.
 */
export function ttcTermsColumnsOf(state: {
  readonly vatMethod: OrderVatMethod;
  readonly discountTtcCents: number | null;
  readonly voucherTtcCents: number | null;
  readonly deliveryFeeTtcCents: number | null;
  readonly ttcByRate: readonly OrderRateAmounts[] | null;
}) {
  return {
    vatMethod: state.vatMethod,
    discountTtcCents: state.discountTtcCents,
    voucherTtcCents: state.voucherTtcCents,
    deliveryFeeTtcCents: state.deliveryFeeTtcCents,
    ttcByRate: ttcByRateColumn(state.ttcByRate),
  };
}

/**
 * La part de chaque taux → `ttc_by_rate` (migration `20261027190000`) ; `NULL`
 * en base pour `line_ht`, jamais la valeur JSON `null`. Partagé par la
 * commande et le BL.
 */
export function ttcByRateColumn(
  parts: readonly OrderRateAmounts[] | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return parts === null
    ? Prisma.DbNull
    : parts.map((part) => ({
        rate: part.rate,
        htCents: part.htCents,
        vatCents: part.vatCents,
        ttcCents: part.ttcCents,
      }));
}

/**
 * La part de chaque taux relue, ou `null` (`line_ht`, ou `exact_ht` d'avant
 * la colonne). Une forme inconnue a été écrite hors de l'application.
 *
 * @throws {FrozenAdjustmentUnreadableError}
 */
export function ttcByRateOf(
  orderId: string,
  value: Prisma.JsonValue,
): readonly OrderRateAmounts[] | null {
  return parsed(orderRatesAmountsSchema, value, orderId, "part de chaque taux");
}

/**
 * Une méthode relue en base. Le CHECK `orders_vat_method` n'en laisse passer
 * que deux ; une autre valeur a été écrite hors de l'application.
 *
 * @throws {UnknownOrderVatMethodError}
 */
export function vatMethodOf(orderId: string, value: string): OrderVatMethod {
  const method = asOrderVatMethod(value);
  if (method === null) {
    throw new UnknownOrderVatMethodError(orderId, value);
  }
  return method;
}

/** Une méthode de TVA inconnue en base — 500. */
export class UnknownOrderVatMethodError extends TechnicalError {
  constructor(orderId: string, value: string) {
    super(
      "orders.vat_method.unknown",
      `La commande ${orderId} porte une méthode de TVA inconnue (« ${value} ») : la colonne a été écrite hors de l'application. Signalez-le à l'équipe technique.`,
    );
  }
}
