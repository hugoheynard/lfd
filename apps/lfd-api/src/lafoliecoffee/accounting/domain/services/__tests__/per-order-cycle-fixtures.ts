import { DELIVERY_VAT_RATE, ventilateVat, type VatExtra } from "@lfd/money";

import type {
  FrozenDeliveryVatMode,
  FrozenInvoiceLine,
  FrozenInvoiceOrder,
} from "../invoice-dossier.types.js";

/**
 * **Des bons figés comme la caisse les fige** — `ventilateVat` dans l'ordre
 * de `computeOrderTotals` : remise de retrait sur les lignes éligibles, bon de
 * fidélité sur le net, port selon son mode. Pour éprouver la facture bon par
 * bon (plan `plan-remises-ventilees-bon-par-bon.md`, §3). Aucune date n'est
 * comparée à une horloge.
 */
export interface BonSpec {
  readonly reference: string;
  readonly lines: readonly FrozenInvoiceLine[];
  readonly pickupDiscountCents?: number;
  readonly voucherCents?: number;
  readonly deliveryFeeCents?: number;
  readonly deliveryVatMode?: FrozenDeliveryVatMode;
}

const UNIT_PRICE_MILLICENTS = 100_000;

/** Une ligne d'un produit, à un taux, pour un HT ; `excluded` = hors remise de retrait. */
export function goodsLine(
  sku: string,
  vatRate: number,
  lineTotalCents: number,
  excluded = false,
): FrozenInvoiceLine {
  return {
    sku,
    productNameSnapshot: `Produit ${sku}`,
    unitPriceMillicents: UNIT_PRICE_MILLICENTS,
    vatRate: vatRate.toFixed(2),
    quantity: 1,
    saleUnit: "piece",
    lineTotalCents,
    ...(excluded ? { pickupDiscountEligible: false } : {}),
  };
}

/** Le bon, ses parts de TVA et son total tels que la passation les a figés. */
export function frozenBon(spec: BonSpec): FrozenInvoiceOrder {
  const deliveryFeeCents = spec.deliveryFeeCents ?? 0;
  const mode = spec.deliveryVatMode ?? "standard";
  const extras: VatExtra[] =
    deliveryFeeCents === 0
      ? []
      : [
          mode === "follows_goods"
            ? { htCents: deliveryFeeCents, followsGoods: true }
            : { htCents: deliveryFeeCents, vatRate: DELIVERY_VAT_RATE },
        ];
  const ventilated = ventilateVat({
    lines: spec.lines.map((line) => ({
      htCents: line.lineTotalCents,
      vatRate: Number(line.vatRate),
      discountEligible: line.pickupDiscountEligible ?? true,
    })),
    eligibleDiscountCents: spec.pickupDiscountCents ?? 0,
    discountCents: spec.voucherCents ?? 0,
    extras,
  });
  return {
    reference: spec.reference,
    createdAt: new Date(0),
    requestedDeliveryDate: null,
    lines: spec.lines,
    discountCents: spec.pickupDiscountCents ?? 0,
    voucherDiscountCents: spec.voucherCents ?? 0,
    deliveryFeeCents,
    deliveryVatMode: deliveryFeeCents === 0 ? null : mode,
    lateFeeCents: 0,
    lateFeeVatRate: null,
    vatShares: ventilated.vat,
    vatCents: ventilated.vatTotalCents,
    totalCents: ventilated.totalCents,
  };
}
