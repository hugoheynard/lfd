import type { LateFeeAdjustment } from "@lfd/contracts";
import type { SaleUnit, VatShare } from "@lfd/money";

import type { OrderVatMethod } from "../value-objects/order-vat-method.js";
import type { DraftedAmounts } from "./order-amounts.js";
import { appliedBasketDiscountsOf, type BasketDiscountTrace } from "./order-basket-discounts.js";

/**
 * **Les montants d'une commande composée, lus sans la muter** (plan
 * `documentation/commandes/passation/commande-passee-par-l-equipe.md`, § 8 P2, BLOQUANT
 * `vitruve` n° 1).
 *
 * `toPersistence()` est le seul autre chemin vers ces nombres, et il refuse un
 * règlement non décidé : décider un règlement pour pouvoir lire un prix aurait
 * fait d'un devis une commande à moitié passée. Ce sont les MÊMES valeurs que
 * la sérialisation écrira — aucune n'est recalculée ici.
 */
export interface OrderAmountsReading {
  readonly vatMethod: OrderVatMethod;
  readonly lines: readonly OrderAmountsLine[];
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly discountTtcCents: number | null;
  readonly discounts: readonly OrderAmountsDiscount[];
  readonly deliveryFeeCents: number;
  readonly deliveryFeeTtcCents: number | null;
  readonly lateFeeCents: number;
  readonly lateFeeVatRatePercent: number | null;
  readonly voucherDiscountCents: number;
  readonly vatCents: number;
  readonly vatShares: readonly VatShare[];
  readonly totalCents: number;
}

/** Une ligne : son prix facturé, et le tarif d'entrée que sa trace a figé. */
export interface OrderAmountsLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  readonly saleUnit: SaleUnit;
  readonly vatRate: number;
  readonly unitPriceMillicents: number;
  /** Le tarif d'entrée de la résolution (`pricing.basePriceMillicents`), `null` sans trace. */
  readonly basePriceMillicents: number | null;
  readonly lineTotalCents: number;
  readonly lineTotalTtcCents: number | null;
}

/** Une remise de panier, dans l'ordre d'application. */
export interface OrderAmountsDiscount {
  readonly rank: number;
  readonly amountCents: number;
  readonly amountTtcCents: number | null;
  readonly promotionId: string | null;
  readonly labelFr: string | null;
}

/** Ce que l'agrégat tient, et que la lecture assemble. */
export interface OrderAmountsSource {
  readonly drafted: DraftedAmounts;
  readonly basketTraces: readonly BasketDiscountTrace[];
  readonly lateFeeCents: number;
  readonly lateFeeAdjustment: LateFeeAdjustment | null;
  readonly voucherDiscountCents: number;
}

/** Assemble la lecture — les valeurs mêmes que `toPersistence()` écrit. */
export function orderAmountsReadingOf(source: OrderAmountsSource): OrderAmountsReading {
  const { drafted } = source;
  return {
    vatMethod: drafted.vatMethod,
    lines: drafted.lines.map((line) => {
      const snapshot = line.toSnapshot();
      return {
        sku: snapshot.sku,
        productName: snapshot.productName,
        quantity: snapshot.quantity,
        saleUnit: snapshot.saleUnit,
        vatRate: snapshot.vatRate,
        unitPriceMillicents: snapshot.unitPriceMillicents,
        basePriceMillicents: snapshot.pricing?.basePriceMillicents ?? null,
        lineTotalCents: snapshot.lineTotalCents,
        lineTotalTtcCents: snapshot.lineTotalTtcCents,
      };
    }),
    subtotalCents: drafted.subtotalCents,
    discountCents: drafted.discountCents,
    discountTtcCents: drafted.ttcTerms?.discountCents ?? null,
    discounts: appliedBasketDiscountsOf(drafted.basketSteps, source.basketTraces).map(
      (applied) => ({
        rank: applied.rank,
        amountCents: applied.amountCents,
        amountTtcCents: applied.amountTtcCents,
        promotionId: applied.promotionId,
        labelFr: applied.label?.fr ?? null,
      }),
    ),
    deliveryFeeCents: drafted.deliveryFeeCents,
    deliveryFeeTtcCents: drafted.ttcTerms?.deliveryFeeCents ?? null,
    lateFeeCents: source.lateFeeCents,
    lateFeeVatRatePercent: source.lateFeeAdjustment?.vatRatePercent ?? null,
    voucherDiscountCents: source.voucherDiscountCents,
    vatCents: drafted.vatCents,
    vatShares: drafted.vatShares,
    totalCents: drafted.totalCents,
  };
}
