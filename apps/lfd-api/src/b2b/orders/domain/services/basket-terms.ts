import type { CartAdjustment, DeliveryVatMode } from "@lfd/contracts";

import type { DraftBasketDiscount } from "../entities/order-shapes.js";
import type { OrderLineClassification } from "../ports/order-line-classification.reader.js";
import type { OrderLineInput } from "../value-objects/order-line.js";
import type { OrderVatMethod } from "../value-objects/order-vat-method.js";
import type { ReplayedBasket } from "./basket-discount-replay.js";
import type { BasketTerms } from "./basket-pricing-context.js";
import { composeExactOrder } from "./exact-order-composition.js";

/** La remise retenue — choisie à la caisse, ou rejouée en révision : la forme du rejeu. */
export type BasketDiscount = Omit<ReplayedBasket, "refusals">;

/** Les frais de zone et le barème qui les produit ; `0` et `null` en retrait. */
export interface BasketDeliveryFee {
  readonly cents: number;
  readonly adjustment: CartAdjustment | null;
}

/** Ce dont les termes de la commande se déduisent, une fois la remise et le port connus. */
export interface BasketTermsInput {
  readonly lines: readonly OrderLineInput[];
  readonly known: ReadonlyMap<string, OrderLineClassification>;
  readonly discount: BasketDiscount;
  readonly deliveryFee: BasketDeliveryFee;
  readonly deliveryVatMode: DeliveryVatMode;
  readonly vatMethod: OrderVatMethod;
}

/**
 * **Les termes de la commande, dans l'unité de sa méthode** (plan du centime,
 * § 5) : HT pour `line_ht`, tels que la caisse les rend ; TTC pour
 * `exact_ht`, par la composition TTC que l'agrégat rejoue.
 *
 * Déménagé d'`OrderComposition.draftOf` le 2026-11-03 (lot L1a de
 * `plan-un-seul-assemblage.md`) sans changer une opération : la passation et
 * la révision y passent par `priceBasket`. La surtaxe n'y est pas : elle
 * dépend d'un verdict (§ 2.3).
 */
export function basketTermsOf(
  input: BasketTermsInput,
): Omit<BasketTerms, "lateFeeCents" | "lateFeeAdjustment"> {
  const { discount, deliveryFee } = input;
  const lines = input.lines.map((line) => classified(line, input.known, discount.ineligibleSkus));
  const cumulated = discount.basketDiscounts;
  const amounts =
    input.vatMethod === "exact_ht"
      ? exactTermsOf(lines, discount, cumulated, deliveryFee, input.deliveryVatMode)
      : { discountCents: discount.discountCents, deliveryFeeCents: deliveryFee.cents };
  return {
    lines,
    discountCents: amounts.discountCents,
    discountAdjustment: discount.discountAdjustment,
    discountLabel: discount.discountLabel,
    discountPromotionId: discount.discountPromotionId,
    discountTerms: discount.discountTerms,
    ...(cumulated === undefined ? {} : { basketDiscounts: cumulated }),
    deliveryFeeAdjustment: deliveryFee.adjustment,
    deliveryFeeCents: amounts.deliveryFeeCents,
    deliveryVatMode: input.deliveryVatMode,
  };
}

/**
 * La remise retrait et le port d'une commande `exact_ht`, en TTC — par la
 * composition même que l'agrégat rejoue pour les vérifier. Le bon n'y entre
 * pas : il s'impute après la remise et ne change ni l'une ni l'autre.
 */
function exactTermsOf(
  lines: readonly OrderLineInput[],
  discount: BasketDiscount,
  cumulated: readonly DraftBasketDiscount[] | undefined,
  deliveryFee: BasketDeliveryFee,
  deliveryVatMode: DeliveryVatMode,
): { readonly discountCents: number; readonly deliveryFeeCents: number } {
  const composed = composeExactOrder({
    lines,
    discountAdjustment: discount.discountAdjustment,
    ...(cumulated === undefined ? {} : { basketDiscounts: cumulated }),
    deliveryFeeAdjustment: deliveryFee.adjustment,
    deliveryVatMode,
    voucherFaceCents: 0,
  });
  const discounted = discount.discountAdjustment !== null || cumulated !== undefined;
  return {
    discountCents: discounted ? composed.pickupDiscount.ttcCents : 0,
    deliveryFeeCents: deliveryFee.adjustment === null ? 0 : composed.deliveryFee.ttcCents,
  };
}

/**
 * La ligne, avec ce qui se fige d'elle à la passation : son rangement au
 * catalogue et son éligibilité à la remise de retrait (R2 du plan des
 * exclusions), et son marqueur « sur mesure ».
 */
function classified(
  line: OrderLineInput,
  known: ReadonlyMap<string, OrderLineClassification>,
  ineligible: ReadonlySet<string>,
): OrderLineInput {
  const where = known.get(line.sku);
  return {
    ...line,
    pickupDiscountEligible: !ineligible.has(line.sku),
    productId: where?.productId ?? null,
    categoryId: where?.categoryId ?? null,
    madeToOrder: madeToOrderOf(line, where),
  };
}

/**
 * Le marqueur « sur mesure » à sceller (plan `plan-sur-mesure-partout.md`,
 * M1). Une ligne qui le porte déjà — une ligne gardée en révision — garde ce
 * qu'elle a scellé, `null` compris : même règle que son prix figé (R3). Une
 * ligne neuve lit le catalogue du jour ; un SKU qu'il ne range pas reste
 * `null`, « on ne savait pas », jamais un `false` inventé.
 */
function madeToOrderOf(
  line: OrderLineInput,
  where: OrderLineClassification | undefined,
): boolean | null {
  if (line.madeToOrder !== undefined) {
    return line.madeToOrder;
  }
  return where?.madeToOrder ?? null;
}
