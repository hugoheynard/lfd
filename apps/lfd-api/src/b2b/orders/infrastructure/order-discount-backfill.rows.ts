import { orderRatesAmountsSchema } from "@lfd/contracts";

import { Prisma } from "../../../platform/database/client/client.js";
import type {
  DiscountVatShare,
  RecoveredDiscount,
  RecoveryLine,
  RecoveryNote,
  RecoveryOrder,
} from "../domain/services/order-discount-recovery-shapes.js";
import { frozenAdjustmentsOf, vatMethodOf } from "./order-money-columns.js";
import { orderLineSaleUnitOf } from "./order-line-row.js";

/**
 * **Les deux traductions de la reprise des remises** (plan des promotions,
 * § 18.3, M2) : colonnes figées → {@link RecoveryOrder}, et remise reprise →
 * lignes `order_discounts` / `order_line_discounts` / `delivery_note_discounts`.
 * Aucun type Prisma ne sort d'ici.
 */

const LINE_SELECT = {
  unitPriceMillicents: true,
  quantity: true,
  saleUnit: true,
  vatRate: true,
  lineTotalCents: true,
  pickupDiscountEligible: true,
  sku: true,
} as const;

/** Ce que la reprise relit d'une commande. */
export const BACKFILL_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  vatMethod: true,
  discountCents: true,
  discountTtcCents: true,
  discountAdjustment: true,
  discountPromotionId: true,
  discountLabel: true,
  deliveryFeeAdjustment: true,
  lateFeeAdjustment: true,
  deliveryVatMode: true,
  voucherTtcCents: true,
  deliveryFeeTtcCents: true,
  ttcByRate: true,
  lines: { select: { id: true, ...LINE_SELECT }, orderBy: { sku: "asc" } },
  deliveryNotes: {
    select: {
      id: true,
      rank: true,
      status: true,
      discountCents: true,
      discountTtcCents: true,
      lines: { select: LINE_SELECT, orderBy: { id: "asc" } },
    },
    orderBy: { rank: "asc" },
  },
} as const;

interface LineRow {
  readonly sku: string;
  readonly unitPriceMillicents: number;
  readonly quantity: number;
  readonly saleUnit: string;
  readonly vatRate: Prisma.Decimal;
  readonly lineTotalCents: number;
  readonly pickupDiscountEligible: boolean | null;
}

/** La forme que Prisma rend pour {@link BACKFILL_ORDER_SELECT}. */
export interface BackfillOrderRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly vatMethod: string;
  readonly discountCents: number;
  readonly discountTtcCents: number | null;
  readonly discountAdjustment: Prisma.JsonValue;
  readonly discountPromotionId: string | null;
  readonly discountLabel: Prisma.JsonValue;
  readonly deliveryFeeAdjustment: Prisma.JsonValue;
  readonly lateFeeAdjustment: Prisma.JsonValue;
  readonly deliveryVatMode: string | null;
  readonly voucherTtcCents: number | null;
  readonly deliveryFeeTtcCents: number | null;
  readonly ttcByRate: Prisma.JsonValue;
  readonly lines: readonly (LineRow & { readonly id: string })[];
  readonly deliveryNotes: readonly {
    readonly id: string;
    readonly rank: number;
    readonly status: string;
    readonly discountCents: number | null;
    readonly discountTtcCents: number | null;
    readonly lines: readonly LineRow[];
  }[];
}

/**
 * Ligne → la commande telle que la reprise la juge.
 *
 * @throws {FrozenAdjustmentUnreadableError} un ajustement figé illisible.
 * @throws {UnknownOrderVatMethodError}
 */
export function toRecoveryOrder(row: BackfillOrderRow): RecoveryOrder {
  const adjustments = frozenAdjustmentsOf(row.id, row);
  const byRate = orderRatesAmountsSchema.safeParse(row.ttcByRate);
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    vatMethod: vatMethodOf(row.id, row.vatMethod),
    discountCents: row.discountCents,
    discountTtcCents: row.discountTtcCents,
    discountAdjustment: adjustments.discount,
    deliveryFeeAdjustment: adjustments.deliveryFee,
    deliveryVatMode: adjustments.deliveryVatMode,
    voucherTtcCents: row.voucherTtcCents,
    deliveryFeeTtcCents: row.deliveryFeeTtcCents,
    ttcByRate: row.ttcByRate !== null && byRate.success ? byRate.data : null,
    lines: row.lines.map((line) => ({ id: line.id, ...recoveryLineOf(line) })),
    notes: row.deliveryNotes.map((note): RecoveryNote => ({
      id: note.id,
      rank: note.rank,
      voided: note.status === "voided",
      discountCents: note.discountCents,
      discountTtcCents: note.discountTtcCents,
      lines: note.lines.map(recoveryLineOf),
    })),
  };
}

function recoveryLineOf(line: LineRow): RecoveryLine {
  return {
    unitPriceMillicents: line.unitPriceMillicents,
    quantity: line.quantity,
    saleUnit: orderLineSaleUnitOf(line.sku, line.saleUnit),
    vatRate: line.vatRate.toNumber(),
    lineTotalCents: line.lineTotalCents,
    // Une ligne de bon d'avant E4a ne disait rien : les bons d'avant étaient
    // tous éligibles, comme le défaut de la colonne de commande.
    eligible: line.pickupDiscountEligible ?? true,
  };
}

/** Ce que la reprise recopie TEL QUEL, sans le juger : promotion, ajustement, libellé. */
export interface FrozenDiscountTrace {
  readonly promotionId: string | null;
  readonly adjustment: Prisma.JsonValue;
  readonly label: Prisma.JsonValue;
}

export function frozenTraceOf(row: BackfillOrderRow): FrozenDiscountTrace {
  return {
    promotionId: row.discountPromotionId,
    adjustment: row.discountAdjustment,
    label: row.discountLabel,
  };
}

/** La remise de rang 1, prête pour `orderDiscount.create`. */
export function orderDiscountData(
  orderId: string,
  discount: RecoveredDiscount,
  trace: FrozenDiscountTrace,
  nextId: () => string,
): Prisma.OrderDiscountUncheckedCreateInput {
  return {
    id: nextId(),
    orderId,
    origin: discount.origin,
    rank: 1,
    promotionId: trace.promotionId,
    adjustment: jsonOrNull(trace.adjustment),
    label: jsonOrNull(trace.label),
    baseCents: discount.baseCents,
    amountCents: discount.amountCents,
    amountTtcCents: discount.amountTtcCents,
    vatShares: sharesJson(discount.vatShares),
    coveredLines: {
      create: discount.coveredLineIds.map((orderLineId) => ({ orderLineId })),
    },
    noteParts: {
      create: discount.notes.map((part) => ({
        id: nextId(),
        noteId: part.noteId,
        amountCents: part.amountCents,
        amountTtcCents: part.amountTtcCents,
        vatShares: sharesJson(part.vatShares),
      })),
    },
  };
}

function jsonOrNull(value: Prisma.JsonValue): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : value;
}

/** Les parts, clés absentes quand le chemin n'en a pas — jamais `null`. */
export function sharesJson(shares: readonly DiscountVatShare[]): Prisma.InputJsonValue {
  return shares.map((share) => ({
    rate: share.rate,
    htCents: share.htCents,
    ...(share.vatCents === undefined ? {} : { vatCents: share.vatCents }),
    ...(share.ttcCents === undefined ? {} : { ttcCents: share.ttcCents }),
  }));
}
