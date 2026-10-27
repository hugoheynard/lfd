import {
  cartAdjustmentSchema,
  deliveryVatModeSchema,
  lateFeeAdjustmentSchema,
  vatSharesSchema,
} from "@lfd/contracts";

import { Prisma } from "../../../platform/database/client/client.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type { BillableAmounts } from "../domain/entities/billable-amounts.js";
import type { FrozenOrderAdjustments } from "../domain/ports/shortfall-decision.reader.js";

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
} as const;

interface FrozenAdjustmentRow {
  readonly discountAdjustment: Prisma.JsonValue;
  readonly deliveryFeeAdjustment: Prisma.JsonValue;
  readonly lateFeeAdjustment: Prisma.JsonValue;
  readonly deliveryVatMode: string | null;
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
  };
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
