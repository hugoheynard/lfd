import { cartAdjustmentCents, type LateFeeAdjustment } from "@lfd/contracts";
import { lineTotalCents } from "@lfd/money";

import { quantityOf } from "../value-objects/order-line.js";
import type { OrderVatMethod } from "../value-objects/order-vat-method.js";
import { replayBasketDiscounts } from "./basket-discount-replay.js";
import {
  NO_BASKET_PROMOTION,
  type BasketLine,
  type BasketPromotionOutcome,
} from "./basket-promotion-choice.js";
import { cumulatedDiscountsOf } from "./basket-promotion-plan.js";
import {
  type BasketAmounts,
  type BasketAwaiting,
  type BasketCart,
  type BasketPricingContext,
  type BasketVerdicts,
  type PartialBasketPricingContext,
  type PricedRoute,
} from "./basket-pricing-context.js";
import { basketTermsOf, type BasketDeliveryFee, type BasketDiscount } from "./basket-terms.js";
import { exactLineTtcsOf } from "./exact-order-composition.js";
import { basketHourNotices } from "./loaded-basket-promotions.js";

/**
 * **Le prix d'un panier** (plan
 * `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`, § 2.2) —
 * synchrone, déterministe, sans port ni horloge : tout ce qu'il consomme a
 * été chargé (`BasketPricingContext`), et ce qui dépend d'un jugement arrive
 * en verdict (§ 2.3).
 *
 * Appelé PAR l'agrégat (`Order.draft`, `Order.recompose`), qui garde ses
 * gardes : la commande ne reçoit plus de montants composés ailleurs. Il ne
 * réécrit aucune règle — choix de la promotion panier, rejeu des remises
 * acquises, frais de zone, termes `exact_ht`, surtaxe : chacune est la
 * fonction que la caisse appelait déjà, déplacée sans changer une opération
 * (lot L1a ; le golden master `test/pricing-golden-master.e2e-spec.ts` le tient).
 */
export function priceBasket(
  context: PartialBasketPricingContext,
  cart: BasketCart,
  verdicts: BasketVerdicts,
): BasketAmounts {
  const priced = basketLinesOf(context, cart.vatMethod);
  // Le sous-total est un MONTANT : arrondi au centime, une fois par ligne,
  // par la même fonction que la ligne persistée. Deux arithmétiques ici
  // feraient diverger le seuil de franco du total facturé.
  const subtotalCents = priced.reduce((sum, line) => sum + line.htCents, 0);
  // Sans acheminement, aucune promotion panier n'a été lue (§ 2.5) : la
  // remise attend le point ou la zone, elle ne se devine pas.
  const notices =
    context.promotions === null
      ? null
      : basketHourNotices(context.promotions, priced, context.known, cart.handoverAt);
  const chosen = notices?.chosen ?? NO_BASKET_PROMOTION;
  // La révision rejoue les remises de la commande, jamais la caisse du
  // moment (plan des remises acquises, § 10.2) : le point, la zone et les
  // frais restent, la remise est remplacée.
  const replay =
    context.replayed === null
      ? null
      : replayBasketDiscounts(context.replayed.discounts, context.replayed.lines, priced);
  const discount: BasketDiscount = replay ?? discountOf(priced, chosen);
  const terms = basketTermsOf({
    lines: context.lines,
    known: context.known,
    discount,
    deliveryFee: deliveryFeeOf(context.route, subtotalCents),
    deliveryVatMode: context.deliveryVatMode,
    vatMethod: cart.vatMethod,
    subtotalCents,
    freeDeliveryThresholdCents: freeDeliveryThresholdOf(context.route),
  });
  return {
    terms: { ...terms, ...lateFeeOf(verdicts.lateFee, subtotalCents) },
    subtotalCents,
    refusals: replay?.refusals ?? [],
    beyondCap: chosen.beyondCap,
    ended: notices?.ended ?? [],
    awaiting: awaitingOf(context, notices?.windowUnjudged ?? false),
  };
}

/**
 * Ce que ce chiffrage attend encore (§ 2.5) — l'acheminement, le créneau.
 */
function awaitingOf(
  context: PartialBasketPricingContext,
  windowUnjudged: boolean,
): readonly BasketAwaiting[] {
  const awaiting: BasketAwaiting[] = [];
  if (context.route === null) awaiting.push("fulfillment");
  if (windowUnjudged) awaiting.push("window");
  return awaiting;
}

/**
 * Les lignes telles que les remises les comparent : HT arrondi par ligne, et
 * en TTC pour `exact_ht`, par la composition même de l'agrégat (M7).
 */
function basketLinesOf(
  context: Pick<BasketPricingContext, "lines" | "sealing">,
  vatMethod: OrderVatMethod,
): readonly BasketLine[] {
  const ttcLines = vatMethod === "exact_ht" ? exactLineTtcsOf(context.lines) : null;
  return context.lines.map((line, index) => ({
    sku: line.sku,
    htCents: lineTotalCents(line.unitPriceMillicents, quantityOf(line)),
    quantity: quantityOf(line).amount,
    exact:
      ttcLines === null ? undefined : { ttcCents: ttcLines[index] ?? 0, vatRate: line.vatRate },
    // La mercuriale qui fixe la ligne retire celle-ci de l'assiette des
    // remises que sa politique refuse (`plan-la-mercuriale-decide.md`, § 8).
    sealing: context.sealing.get(line.sku) ?? null,
  }));
}

/**
 * Les remises que la caisse a retenues, dans la forme que l'agrégat reçoit :
 * cumulées à partir de deux (lot M7), sinon la remise unique et ses termes.
 */
function discountOf(lines: readonly BasketLine[], outcome: BasketPromotionOutcome): BasketDiscount {
  const [first] = outcome.applied;
  return {
    discountCents: outcome.discountCents,
    discountAdjustment: outcome.discountAdjustment,
    discountLabel: outcome.label,
    discountPromotionId: outcome.promotionId,
    ineligibleSkus: outcome.ineligibleSkus,
    basketDiscounts: cumulatedDiscountsOf(lines, outcome.applied),
    discountTerms: outcome.applied.length === 1 && first !== undefined ? first.terms : null,
  };
}

/** Les frais de la zone sur le sous-total des marchandises ; aucun en retrait ni sans acheminement. */
function deliveryFeeOf(route: PricedRoute | null, subtotalCents: number): BasketDeliveryFee {
  if (route === null || route.method === "pickup") {
    return { cents: 0, adjustment: null };
  }
  return { cents: cartAdjustmentCents(route.fee, subtotalCents), adjustment: route.fee };
}

/** Le seuil du franco de la zone (1b) ; aucun en retrait ni sans acheminement. */
function freeDeliveryThresholdOf(route: PricedRoute | null): number | null {
  return route === null || route.method === "pickup" ? null : route.freeDeliveryThresholdCents;
}

/**
 * La surtaxe, **seulement quand un verdict l'a posée** : son ajustement
 * appliqué au sous-total, et le taux qui voyage avec le montant.
 */
function lateFeeOf(
  lateFee: LateFeeAdjustment | null,
  subtotalCents: number,
): { readonly lateFeeCents: number; readonly lateFeeAdjustment: LateFeeAdjustment | null } {
  if (lateFee === null) {
    return { lateFeeCents: 0, lateFeeAdjustment: null };
  }
  return {
    lateFeeCents: cartAdjustmentCents(lateFee.adjustment, subtotalCents),
    lateFeeAdjustment: lateFee,
  };
}
