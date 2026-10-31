import { discountCentsOf, type CartAdjustment } from "@lfd/contracts";

import {
  minQuantityOf,
  type AdmittedPromotion,
  type LivePromotion,
} from "../../../promotions/domain/live-promotion.js";
import type { PromotionEffect } from "../../../promotions/domain/promotion-effect.js";
import type { ServedPromotionLabel } from "../../../promotions/domain/promotion-labels.js";
import { promotionScopeCovers } from "../../../promotions/domain/promotion-scope.js";
import type { OrderLineClassification } from "../ports/order-line-classification.reader.js";
import {
  basketPromotionPlanOf,
  type BasketCandidate,
  type BasketPromotionApplied,
} from "./basket-promotion-plan.js";
import { placedTermsOf } from "./frozen-discount-terms.js";
import { eligibleSubtotalCents, type PricedLine } from "./pickup-discount-eligibility.js";

export type { BasketPromotionApplied } from "./basket-promotion-plan.js";

/**
 * **Le point PANIER d'une promotion** (`documentation/promotions/promotions.md`, § 2.2 et § 2.16, lot L5) — pur. Ce que la remise de retrait fait
 * aujourd'hui, dit dans le vocabulaire des promotions : un montant en
 * centimes sur l'assiette des lignes couvertes, après le prix des lignes,
 * borné à elle par la même `discountCentsOf`, arrondi une fois.
 */

/** Une ligne chiffrée, et sa quantité — la condition `min_quantity` la lit. */
export interface BasketLine extends PricedLine {
  readonly quantity: number;
  /**
   * Son TTC et son taux, pour une commande composée en TTC (`exact_ht`) :
   * les plans de remise s'y comparent en TTC (M7, 2026-10-31). Absent = `line_ht`.
   */
  readonly exact?: { readonly ttcCents: number; readonly vatRate: number } | undefined;
}

/** La forme de `ResolvedPickup`, moins le point : rien en aval ne change. */
export interface BasketPromotionOutcome {
  readonly discountCents: number;
  readonly discountAdjustment: CartAdjustment | null;
  readonly ineligibleSkus: ReadonlySet<string>;
  /** La promotion retenue — ce que la révision comparera (L9). */
  readonly promotionId: string | null;
  /**
   * Son libellé dans l'audience de l'acheteur, trois langues — ce que la
   * commande FIGE (`orders.discount_label`, L8b, § 15.8). `null` sans
   * promotion, et sous l'ancien chemin (la remise d'un site n'en a pas).
   */
  readonly label: ServedPromotionLabel | null;
  /**
   * Les remises retenues, dans l'ordre d'application (lot M7, § 18.6) —
   * vide sans remise, une entrée pour la remise unique d'hier. À partir de
   * DEUX, les champs ci-dessus disent le total : `discountCents` la somme
   * des étapes dans l'unité de la commande (HT, ou TTC en `exact_ht`), `ineligibleSkus` les SKU qu'aucune ne couvre,
   * `discountAdjustment` et `promotionId` à `null` (arbitrage n° 1, § 18.8 :
   * un ajustement de rang 1 seul ferait recomposer une remise fausse), et
   * `label` le libellé générique {@link MULTIPLE_BASKET_DISCOUNTS_LABEL}.
   */
  readonly applied: readonly BasketPromotionApplied[];
  /**
   * Les promotions cumulables écartées par le plafond de cinq — présent
   * seulement s'il y en a : l'application le journalise (M7, 2026-10-31).
   */
  readonly beyondCap?: readonly string[];
}

export const NO_BASKET_PROMOTION: BasketPromotionOutcome = {
  discountCents: 0,
  discountAdjustment: null,
  ineligibleSkus: new Set(),
  promotionId: null,
  label: null,
  applied: [],
};

/**
 * Le libellé figé d'une commande à plusieurs remises (`orders.discount_label`,
 * arbitrage n° 1 du § 18.8) — le détail fait foi dans `order_discounts`.
 */
export const MULTIPLE_BASKET_DISCOUNTS_LABEL: ServedPromotionLabel = {
  fr: "Remises",
  en: "Discounts",
  it: "Sconti",
};

/**
 * **Les promotions panier de cette commande**, parmi celles déjà admises
 * (fenêtre, pause, public, acheminement jugés) — la forme du plan des
 * promotions, § 16.1, lot M7 (`basketPromotionPlanOf`) : la meilleure non
 * cumulable par article, comme hier — la plus spécifique (public — le rang
 * de la cible qui admet l'acheteur, L8b —, puis acheminement), puis la plus
 * avantageuse pour le client, puis le plus petit identifiant —, plus les
 * cumulables enchaînées.
 *
 * Sans cumulable, l'écran (L7) refuse deux promotions panier qui pourraient
 * s'appliquer ensemble : il en reste au plus une, et la réponse est celle
 * d'hier, champ pour champ.
 *
 * Une promotion qui ne retire rien à CE panier (portée sans article commun,
 * seuil non atteint) ne concourt pas : elle ne vise aucun article, et la
 * laisser gagner sur son seul rang figeait une remise de 0 c à la place
 * d'une remise réelle (brutus, 2026-10-30).
 */
export function chooseBasketPromotion(
  candidates: readonly AdmittedPromotion[],
  lines: readonly BasketLine[],
  classifications: ReadonlyMap<string, OrderLineClassification>,
): BasketPromotionOutcome {
  const outcomes = new Map<string, BasketPromotionOutcome>();
  const scored: BasketCandidate[] = [];
  for (const promotion of candidates) {
    const outcome = outcomeOf(promotion, lines, classifications);
    if (outcome.discountCents === 0 || outcome.discountAdjustment === null) {
      continue;
    }
    outcomes.set(promotion.id, outcome);
    scored.push({
      promotion,
      adjustment: outcome.discountAdjustment,
      aloneCents: outcome.discountCents,
      ineligibleSkus: outcome.ineligibleSkus,
    });
  }
  const { applied: plan, beyondCap } = basketPromotionPlanOf(scored, lines);
  const capped = beyondCap.length === 0 ? {} : { beyondCap };
  const [first] = plan;
  if (first === undefined) {
    return NO_BASKET_PROMOTION;
  }
  if (plan.length === 1) {
    // La remise unique d'hier, telle que `outcomeOf` la rend.
    return { ...(outcomes.get(first.promotionId) ?? NO_BASKET_PROMOTION), ...capped };
  }
  return {
    discountCents: plan.reduce((sum, step) => sum + step.discountCents, 0),
    discountAdjustment: null,
    ineligibleSkus: new Set(
      lines
        .filter((line) => plan.every((step) => step.ineligibleSkus.has(line.sku)))
        .map((line) => line.sku),
    ),
    promotionId: null,
    label: MULTIPLE_BASKET_DISCOUNTS_LABEL,
    applied: plan,
    ...capped,
  };
}

/** Ce que cette promotion retirerait de ce panier. */
export function outcomeOf(
  promotion: AdmittedPromotion,
  lines: readonly BasketLine[],
  classifications: ReadonlyMap<string, OrderLineClassification>,
): BasketPromotionOutcome {
  const threshold = minQuantityOf(promotion);
  const ineligibleSkus = new Set<string>();
  for (const line of lines) {
    const known = classifications.get(line.sku);
    const facts = {
      sku: line.sku,
      productId: known?.productId ?? null,
      categoryPath: known?.categoryPath ?? [],
    };
    const covered = promotionScopeCovers(promotion.scope, facts, { kind: "basket" });
    if (!covered || (threshold !== null && line.quantity < threshold)) {
      ineligibleSkus.add(line.sku);
    }
  }
  const adjustment = adjustmentOf(promotion.effect);
  const discountCents =
    adjustment === null
      ? 0
      : discountCentsOf(adjustment, eligibleSubtotalCents(lines, ineligibleSkus));
  return {
    discountCents,
    discountAdjustment: adjustment,
    ineligibleSkus,
    promotionId: promotion.id,
    label: promotion.servedLabel,
    applied:
      adjustment === null || discountCents === 0
        ? []
        : [
            {
              promotionId: promotion.id,
              adjustment,
              label: promotion.servedLabel,
              ineligibleSkus,
              discountCents,
              terms: placedTermsOf(promotion),
            },
          ],
  };
}

/** Une promotion panier a-t-elle besoin du rangement des lignes au catalogue ? */
export function needsClassifications(candidates: readonly LivePromotion[]): boolean {
  return candidates.some((promotion) => promotion.scope.rules.length > 0);
}

/**
 * L'effet, en ajustement de panier. `null` pour un effet de ligne, que
 * l'agrégat refuse au panier (`EFFECTS_AT`) — refusé ici aussi plutôt
 * qu'inventé.
 */
function adjustmentOf(effect: PromotionEffect): CartAdjustment | null {
  switch (effect.kind) {
    case "percent_off":
      return { mode: "percent", bp: effect.basisPoints };
    case "basket_amount_off":
      return { mode: "amount", cents: effect.cents };
    case "unit_amount_off":
    case "fixed_unit_price":
      return null;
  }
}
