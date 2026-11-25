import type { AdminOrderEstimateAmountsView } from "@lfd/contracts";
import { orderPretaxCents } from "@lfd/money";

import type { OrderAmountsReading } from "../../domain/entities/order-amounts-reading.js";
import type { OrderOffer } from "../../domain/value-objects/order-offer.js";

/**
 * La lecture de l'agrégat → la vue du contrat. Partagée par toutes les
 * estimations de l'équipe — la saisie, le particulier au comptoir, l'offerte
 * et le reliquat : une seule vue des montants.
 */
export function amountsViewOf(
  reading: OrderAmountsReading,
  offer: OrderOffer | null = null,
): AdminOrderEstimateAmountsView {
  return {
    ...(offer === null ? {} : { offeredTotalCents: offer.value.totalCents }),
    vatMethod: reading.vatMethod,
    lines: reading.lines,
    subtotalCents: reading.subtotalCents,
    discountCents: reading.discountCents,
    discountTtcCents: reading.discountTtcCents,
    discounts: reading.discounts.map((discount) => ({
      rank: discount.rank,
      amountCents: discount.amountCents,
      amountTtcCents: discount.amountTtcCents,
      promotionId: discount.promotionId,
      label: discount.labelFr,
    })),
    deliveryFeeCents: reading.deliveryFeeCents,
    deliveryFeeTtcCents: reading.deliveryFeeTtcCents,
    lateFeeCents: reading.lateFeeCents,
    lateFeeVatRatePercent: reading.lateFeeVatRatePercent,
    vatCents: reading.vatCents,
    vatShares: reading.vatShares,
    pretaxCents: orderPretaxCents(reading),
    totalCents: reading.totalCents,
  };
}
