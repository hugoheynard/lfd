import {
  minQuantityOf,
  targetingRankOf,
  type LivePromotion,
} from "../../promotions/domain/live-promotion.js";
import type { PromotionEffect } from "../../promotions/domain/promotion-effect.js";
import {
  MODE_RANK,
  NATURAL_TARGET_RANK,
  promotionScopeMatch,
  type PromotionScopeMatch,
} from "../../promotions/domain/promotion-scope.js";
import type { PriceRule, PriceScope, PricingContext } from "./price-rule.js";

/**
 * **Une promotion du point LIGNE, présentée à la chaîne comme une règle de
 * l'étage `promotion`** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.5, lot L5) — sur le patron de `ladderAsRule` : la chaîne ne change
 * pas, elle reçoit une règle de plus.
 *
 * Même place (entre volume et geste), même scellement par la mercuriale (sauf
 * `stacksOverMercuriale`), même plancher, même arrondi unique : ce qui le
 * tient est que la règle rendue est une `PriceRule` comme les autres.
 *
 * La portée est jugée ICI, pour cet article : la règle rendue porte une
 * portée **qui le vise**, au rang de la décision qui l'a couvert (le mode, la
 * famille la plus proche, le produit, la déclinaison). Une règle de prix
 * reprise retrouve ainsi exactement sa portée d'origine — `global`, sa
 * famille, son SKU au rang `product` ou `variant` —, donc sa trace et son
 * rang dans `winnerOf`.
 *
 * L'audience rendue est `all` : le public a été jugé au chargement
 * (`promotionsAdmitted`), comme `inForceFor` juge celle des règles, et son
 * RANG voyage dans `promotion`.
 *
 * `null` : l'article n'est pas couvert. Rien n'est consigné — une règle hors
 * portée n'atteint pas non plus la chaîne (l'index par portée l'écarte).
 */
export function promotionAsRule(
  promotion: LivePromotion,
  context: PricingContext,
): PriceRule | null {
  // 🔴 Une cible `product` vise `catalog_items.product_id`, que la chaîne de
  // prix ne connaît pas (`PricingContext` n'a que le SKU, vérifié le
  // 2026-10-30). Le fait manque : la promotion ne s'applique pas, plutôt que
  // de laisser une exception « tout sauf ce produit » couvrir ce produit.
  // Aucune promotion de ligne n'en porte après la reprise (portées des règles
  // : famille ou SKU, § 13.4).
  if (promotion.scope.rules.some((rule) => rule.target === "product")) {
    return null;
  }
  const nature = natureOf(promotion.effect);
  if (nature === null) {
    return null;
  }
  const match = promotionScopeMatch(
    promotion.scope,
    { sku: context.variantSku, productId: null, categoryPath: context.categoryPath },
    { kind: "line", saleUnit: context.saleUnit },
  );
  if (match === null) {
    return null;
  }
  return {
    id: promotion.id,
    stage: "promotion",
    scope: scopeOf(match, context),
    audience: { type: "all", id: null },
    minQuantity: minQuantityOf(promotion),
    validFrom: promotion.validFrom,
    validTo: promotion.validTo,
    suspendedFrom: promotion.suspendedFrom,
    label: promotion.label,
    stacksOverMercuriale: promotion.stacksOverMercuriale,
    promotion: targetingRankOf(promotion),
    ...nature,
  };
}

/** Les promotions qui visent cet article, en règles. */
export function promotionRulesFor(
  promotions: readonly LivePromotion[],
  context: PricingContext,
): PriceRule[] {
  return promotions
    .map((promotion) => promotionAsRule(promotion, context))
    .filter((rule): rule is PriceRule => rule !== null);
}

/** La portée qui vise CET article, au rang de la décision qui l'a couvert. */
function scopeOf(match: PromotionScopeMatch, context: PricingContext): PriceScope {
  if (match.rank === MODE_RANK) {
    return { type: "global", id: null };
  }
  if (match.familyCloseness > 0) {
    const index = context.categoryPath.length - match.familyCloseness;
    return { type: "category", id: context.categoryPath[index] ?? null };
  }
  return match.rank === NATURAL_TARGET_RANK.variant
    ? { type: "variant", id: context.variantSku }
    : { type: "product", id: context.productSku };
}

type RuleNature =
  | Pick<Extract<PriceRule, { nature: "replace" }>, "nature" | "amountMillicents">
  | Pick<Extract<PriceRule, { nature: "alter" }>, "nature" | "alteration">;

/**
 * L'effet, dans la nature d'une règle : prix posé, ou baisse. `null` pour
 * une remise de panier, qui n'a pas de lecture à l'unité — l'agrégat la
 * refuse au point ligne (`EFFECTS_AT`) ; la refuser ici aussi plutôt que
 * d'inventer une valeur.
 */
function natureOf(effect: PromotionEffect): RuleNature | null {
  switch (effect.kind) {
    case "fixed_unit_price":
      return { nature: "replace", amountMillicents: effect.millicents };
    case "percent_off":
      return {
        nature: "alter",
        alteration: { direction: "decrease", mode: "percent", bp: effect.basisPoints },
      };
    case "unit_amount_off":
      return {
        nature: "alter",
        alteration: { direction: "decrease", mode: "amount", millicents: effect.millicents },
      };
    case "basket_amount_off":
      return null;
  }
}
