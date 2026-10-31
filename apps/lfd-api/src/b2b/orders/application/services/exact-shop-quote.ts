import type { CartAdjustment, DeliveryVatMode, ShopQuoteView } from "@lfd/contracts";
import type { SaleUnit } from "@lfd/money";

import { composeExactOrder } from "../../domain/services/exact-order-composition.js";
import { pickupDiscountBaseOf } from "../../domain/services/pickup-discount-base.js";
import { exactVoucherTotalEffectCents } from "../../domain/services/voucher-total-effect.js";
import type { BasketPromotionApplied } from "../../domain/services/basket-promotion-choice.js";
import { cumulatedDiscountsOf } from "../../domain/services/basket-promotion-plan.js";
import { discountView } from "./cumulated-shop-quote.js";

/**
 * **Le devis d'un particulier, composé en TTC** (`exact_ht`, plan
 * `documentation/pricing/centime-et-tva/plan-centime-particuliers.md`, § 4 à § 6) — la
 * composition même que l'agrégat fera à la passation (`composeExactOrder`),
 * donc le total qu'il prélèvera : Σ quantité × étiquette, moins la remise et
 * le bon, plus le port, tous en TTC.
 *
 * La vue garde le sens de ses champs (contrat servi) : les montants de
 * terme y restent HT, et ce sont les HT que la commande figera — leur somme
 * plus la TVA fait le total, au centime. La lecture des TTC des termes par la
 * boutique est le lot C3.
 */
export interface ExactQuoteInput {
  readonly lines: readonly {
    readonly sku: string;
    readonly quantity: number;
    readonly saleUnit: SaleUnit;
    readonly unitPriceMillicents: number;
    readonly vatRate: number;
  }[];
  readonly ineligibleSkus: ReadonlySet<string>;
  readonly discountAdjustment: CartAdjustment | null;
  /** Les remises retenues ; à partir de deux, cumulées (lot M7) et seules lues. */
  readonly applied: readonly BasketPromotionApplied[];
  readonly deliveryFeeAdjustment: CartAdjustment | null;
  readonly deliveryVatMode: DeliveryVatMode;
  /** La valeur faciale TTC du bon nommé, `0` sans bon (§ 10, Q2). */
  readonly voucherFaceCents: number;
}

export function exactShopQuoteOf(input: ExactQuoteInput): {
  readonly view: ShopQuoteView;
  readonly voucherTotalEffectCents: number;
} {
  const eligible = (sku: string) => !input.ineligibleSkus.has(sku);
  // La remise du devis passe en LISTE (plan des promotions, § 18.6, lot M1) :
  // une liste à un élément rend la remise unique au centime.
  const coveredLines = input.lines.flatMap((line, i) => (eligible(line.sku) ? [i] : []));
  const cumulated = cumulatedDiscountsOf(input.lines, input.applied);
  const composition = composeExactOrder({
    lines: input.lines.map((line) => ({ ...line, pickupDiscountEligible: eligible(line.sku) })),
    discountAdjustment: null,
    basketDiscounts:
      cumulated ??
      (input.discountAdjustment === null
        ? []
        : [{ adjustment: input.discountAdjustment, coveredLines }]),
    deliveryFeeAdjustment: input.deliveryFeeAdjustment,
    deliveryVatMode: input.deliveryVatMode,
    voucherFaceCents: input.voucherFaceCents,
  });
  const lines = input.lines.map((line, i) => {
    const composed = composition.lines[i];
    return {
      sku: line.sku,
      quantity: line.quantity,
      saleUnit: line.saleUnit,
      unitPriceMillicents: line.unitPriceMillicents,
      lineTotalCents: composed?.htCents ?? 0,
      lineTotalTtcCents: composed?.ttcCents ?? 0,
      vatRatePercent: line.vatRate,
    };
  });
  const base = pickupDiscountBaseOf(
    input.discountAdjustment !== null || cumulated !== undefined,
    lines.map((line) => ({ ...line, eligible: eligible(line.sku) })),
  );
  const view: ShopQuoteView = {
    lines,
    subtotalHtCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0),
    discountCents: composition.pickupDiscount.htCents,
    discountAdjustment: input.discountAdjustment,
    ...(cumulated === undefined
      ? {}
      : {
          discounts: composition.basketDiscounts.map((term, i) =>
            discountView(input.applied[i], term.htCents, term.ttcCents),
          ),
        }),
    ...(base === null ? {} : { pickupDiscountBase: base }),
    voucherDiscountCents: composition.voucher.htCents,
    deliveryFeeCents: composition.deliveryFee.htCents,
    deliveryVatMode: input.deliveryVatMode,
    vat: composition.byRate
      .filter((part) => part.vatCents !== 0)
      .map((part) => ({ rate: part.vatRate, amountCents: part.vatCents })),
    totalCents: composition.total.ttcCents,
  };
  return { view, voucherTotalEffectCents: exactVoucherTotalEffectCents(composition) };
}
