import type { DeliveryNoteOrder } from "../domain/ports/order-lines-for-delivery-note.js";
import type { Prisma } from "../../../platform/database/client/client.js";

/**
 * Ce que le bon de livraison recopie des lignes d'une commande — une seule
 * sélection pour la prévision (E1), le suivi et le réconciliateur (E2) : les
 * trois recopient la même forme. Lignes par identifiant : l'ordre des lignes.
 */
export const DELIVERY_NOTE_LINE_SELECT = {
  orderBy: { id: "asc" },
  select: {
    sku: true,
    productNameSnapshot: true,
    unitPriceMillicents: true,
    vatRate: true,
    quantity: true,
    lineTotalCents: true,
    unitPriceTtcCents: true,
    lineTotalTtcCents: true,
    pickupDiscountEligible: true,
  },
} as const;

/** Les totaux d'en-tête que le BL recopie (plan E4a, § 1 et § 4). */
export const DELIVERY_NOTE_TERMS_SELECT = {
  id: true,
  orderNumber: true,
  subtotalCents: true,
  discountCents: true,
  voucherDiscountCents: true,
  deliveryFeeCents: true,
  deliveryVatMode: true,
  lateFeeCents: true,
  lateFeeAdjustment: true,
  vatShares: true,
  vatCents: true,
  totalCents: true,
} as const;

export interface DeliveryNoteOrderRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly voucherDiscountCents: number;
  readonly deliveryFeeCents: number;
  readonly deliveryVatMode: string | null;
  readonly lateFeeCents: number;
  readonly lateFeeAdjustment: Prisma.JsonValue;
  readonly vatShares: Prisma.JsonValue;
  readonly vatCents: number;
  readonly totalCents: number;
  readonly lines: readonly {
    readonly sku: string;
    readonly productNameSnapshot: string;
    readonly unitPriceMillicents: number;
    readonly vatRate: { toNumber(): number };
    readonly quantity: number;
    readonly lineTotalCents: number;
    readonly unitPriceTtcCents: number | null;
    readonly lineTotalTtcCents: number | null;
    readonly pickupDiscountEligible: boolean;
  }[];
}

/** Ligne → commande vue du BL ; les colonnes JSON passent telles quelles. */
export function toDeliveryNoteOrder(row: DeliveryNoteOrderRow): DeliveryNoteOrder {
  return {
    orderId: row.id,
    orderNumber: row.orderNumber,
    lines: row.lines.map(({ productNameSnapshot, vatRate, ...line }) => ({
      ...line,
      productName: productNameSnapshot,
      vatRate: vatRate.toNumber(),
    })),
    terms: {
      subtotalCents: row.subtotalCents,
      discountCents: row.discountCents,
      voucherDiscountCents: row.voucherDiscountCents,
      deliveryFeeCents: row.deliveryFeeCents,
      deliveryVatMode: row.deliveryVatMode,
      lateFeeCents: row.lateFeeCents,
      lateFeeAdjustment: row.lateFeeAdjustment,
      vatShares: row.vatShares,
      vatCents: row.vatCents,
      totalCents: row.totalCents,
    },
  };
}
