import type { CartAdjustment, DeliveryVatMode } from "@lfd/contracts";

import type { DraftBasketDiscount } from "../entities/order-shapes.js";
import type { OrderLineClassification } from "../ports/order-line-classification.reader.js";
import type { OrderLineInput } from "../value-objects/order-line.js";
import type { OrderVatMethod } from "../value-objects/order-vat-method.js";
import type { ReplayedBasket } from "./basket-discount-replay.js";
import type { BasketTerms } from "./basket-pricing-context.js";
import { composeExactOrder } from "./exact-order-composition.js";
import {
  freeDeliveryProgressOf,
  judgedFreeDelivery,
  type FreeDeliveryJudgementInput,
  type FreeDeliveryProgress,
} from "./free-delivery-judgement.js";

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
  /** Le sous-total HT arrondi par ligne (`priceBasket`) — la base `line_ht` du franco. */
  readonly subtotalCents: number;
  /** Le seuil du franco de la route ; `null` = aucun (retrait, ou rien de réglé). */
  readonly freeDeliveryThresholdCents: number | null;
}

/** Les montants d'une méthode, et ce que le franco en lit. */
interface MethodAmounts {
  readonly discountCents: number;
  readonly deliveryFeeCents: number;
  readonly goodsNetHtCents: number;
  readonly goodsNetTtcCents: number | null;
  readonly feeHtCents: number;
  readonly feeTtcCents: number | null;
}

/**
 * **Les termes de la commande, dans l'unité de sa méthode** (plan du centime,
 * § 5) : HT pour `line_ht`, tels que la caisse les rend ; TTC pour
 * `exact_ht`, par la composition TTC que l'agrégat rejoue.
 *
 * Déménagé d'`OrderComposition.draftOf` le 2026-11-03 (lot L1a de
 * `le-prix-d-un-panier.md`) sans changer une opération : la passation et
 * la révision y passent par `priceBasket`. La surtaxe n'y est pas : elle
 * dépend d'un verdict (§ 2.3).
 *
 * 🔴 **Le franco se juge ICI** (plan `plan-livraison-offerte.md`, 1b) : c'est
 * le seul endroit où la base du seuil — les marchandises HT après les remises
 * — est connue dans les deux méthodes sans composer deux fois. En `line_ht`,
 * le sous-total moins la remise HT (la base même où le bon s'impute) ; en
 * `exact_ht`, Σ HT des lignes composées moins la remise HT composée, lus sur
 * LA composition qui chiffre déjà la remise et le port. Au franco, le frais
 * facturé vaut 0 et le barème offert reste figé.
 */
export function basketTermsOf(input: BasketTermsInput): Omit<
  BasketTerms,
  "lateFeeCents" | "lateFeeAdjustment"
> & {
  /** Où en est le panier du franco (1c) — pour le devis, hors des termes figés. */
  readonly freeDeliveryProgress: FreeDeliveryProgress | null;
} {
  const { discount, deliveryFee } = input;
  const lines = input.lines.map((line) => classified(line, input.known, discount.ineligibleSkus));
  const cumulated = discount.basketDiscounts;
  const amounts =
    input.vatMethod === "exact_ht"
      ? exactTermsOf(lines, discount, cumulated, deliveryFee, input.deliveryVatMode)
      : lineHtTermsOf(input.subtotalCents, discount, deliveryFee);
  const judgement: FreeDeliveryJudgementInput = {
    thresholdCents: input.freeDeliveryThresholdCents,
    goodsNetHtCents: amounts.goodsNetHtCents,
    goodsNetTtcCents: amounts.goodsNetTtcCents,
    feeHtCents: amounts.feeHtCents,
    feeTtcCents: amounts.feeTtcCents,
  };
  const charged = deliveryFee.adjustment !== null;
  const freeDelivery = charged ? judgedFreeDelivery(judgement) : null;
  return {
    lines,
    discountCents: amounts.discountCents,
    discountAdjustment: discount.discountAdjustment,
    discountLabel: discount.discountLabel,
    discountPromotionId: discount.discountPromotionId,
    discountTerms: discount.discountTerms,
    ...(cumulated === undefined ? {} : { basketDiscounts: cumulated }),
    deliveryFeeAdjustment: deliveryFee.adjustment,
    deliveryFeeCents: freeDelivery === null ? amounts.deliveryFeeCents : 0,
    freeDelivery,
    deliveryVatMode: input.deliveryVatMode,
    freeDeliveryProgress: charged ? freeDeliveryProgressOf(judgement, freeDelivery) : null,
  };
}

/** `line_ht` : les montants tels que la caisse les rend, en HT. */
function lineHtTermsOf(
  subtotalCents: number,
  discount: BasketDiscount,
  deliveryFee: BasketDeliveryFee,
): MethodAmounts {
  return {
    discountCents: discount.discountCents,
    deliveryFeeCents: deliveryFee.cents,
    goodsNetHtCents: subtotalCents - discount.discountCents,
    goodsNetTtcCents: null,
    feeHtCents: deliveryFee.cents,
    feeTtcCents: null,
  };
}

/**
 * La remise retrait et le port d'une commande `exact_ht`, en TTC — par la
 * composition même que l'agrégat rejoue pour les vérifier. Le bon n'y entre
 * pas : il s'impute après la remise et ne change ni l'une ni l'autre. La
 * même composition rend la base HT du franco : les lignes et les remises n'y
 * dépendent pas du port.
 */
function exactTermsOf(
  lines: readonly OrderLineInput[],
  discount: BasketDiscount,
  cumulated: readonly DraftBasketDiscount[] | undefined,
  deliveryFee: BasketDeliveryFee,
  deliveryVatMode: DeliveryVatMode,
): MethodAmounts {
  const composed = composeExactOrder({
    lines,
    discountAdjustment: discount.discountAdjustment,
    ...(cumulated === undefined ? {} : { basketDiscounts: cumulated }),
    deliveryFeeAdjustment: deliveryFee.adjustment,
    deliveryVatMode,
    voucherFaceCents: 0,
  });
  const discounted = discount.discountAdjustment !== null || cumulated !== undefined;
  const charged = deliveryFee.adjustment !== null;
  const linesHtCents = composed.lines.reduce((sum, line) => sum + line.htCents, 0);
  const linesTtcCents = composed.lines.reduce((sum, line) => sum + line.ttcCents, 0);
  return {
    discountCents: discounted ? composed.pickupDiscount.ttcCents : 0,
    deliveryFeeCents: charged ? composed.deliveryFee.ttcCents : 0,
    goodsNetHtCents: linesHtCents - composed.pickupDiscount.htCents,
    goodsNetTtcCents: linesTtcCents - composed.pickupDiscount.ttcCents,
    feeHtCents: charged ? composed.deliveryFee.htCents : 0,
    feeTtcCents: charged ? composed.deliveryFee.ttcCents : 0,
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
