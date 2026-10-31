import type { OrderDiscountView } from "@lfd/contracts";
import type { VatBasketDiscount } from "@lfd/money";

import { chainLineHtBasketDiscounts } from "../../domain/services/basket-discounts.js";
import type { BasketPromotionApplied } from "../../domain/services/basket-promotion-choice.js";
import { cumulatedDiscountsOf } from "../../domain/services/basket-promotion-plan.js";

/**
 * **Le devis de plusieurs remises de panier** (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 18.6, lot M7) — la chaîne même que l'agrégat rejouera à la passation
 * (`lineHtCumulatedStepsOf`, `exactCumulatedStepsOf`) : un devis qui ne
 * prédit pas la commande au centime ne sert à rien.
 *
 * `null` pour la remise unique d'hier ou aucune : leur chemin ne change pas.
 */

/** Le chemin `line_ht` : les remises pour `ventilateVat`, et leur vue. */
export interface LineHtCumulatedQuote {
  readonly eligibleDiscounts: readonly VatBasketDiscount[];
  readonly views: readonly OrderDiscountView[];
}

/**
 * @throws {TooManyBasketDiscountsError} plus de remises qu'une commande n'en porte.
 */
export function lineHtCumulatedQuoteOf(
  lines: readonly {
    readonly sku: string;
    readonly lineTotalCents: number;
    readonly vatRatePercent: number;
  }[],
  applied: readonly BasketPromotionApplied[],
): LineHtCumulatedQuote | null {
  const cumulated = cumulatedDiscountsOf(lines, applied);
  if (cumulated === undefined) {
    return null;
  }
  const chain = chainLineHtBasketDiscounts(
    lines.map((line) => ({ htCents: line.lineTotalCents, vatRate: line.vatRatePercent })),
    cumulated,
  );
  return {
    eligibleDiscounts: chain.steps.map((step, index) => ({
      cents: step.amountCents,
      coveredLines: cumulated[index]?.coveredLines ?? [],
    })),
    views: chain.steps.map((step, index) => discountView(applied[index], step.amountCents, null)),
  };
}

/** Une remise telle que le devis l'annonce — la forme de la commande. */
export function discountView(
  discount: BasketPromotionApplied | undefined,
  amountCents: number,
  amountTtcCents: number | null,
): OrderDiscountView {
  return {
    ...(discount === undefined ? {} : { label: discount.label }),
    adjustment: discount?.adjustment ?? null,
    amountCents,
    amountTtcCents,
  };
}
