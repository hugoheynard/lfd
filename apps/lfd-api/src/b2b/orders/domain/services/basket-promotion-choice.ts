import { discountCentsOf, type CartAdjustment } from "@lfd/contracts";

import {
  minQuantityOf,
  targetingRankOf,
  type AdmittedPromotion,
  type LivePromotion,
} from "../../../promotions/domain/live-promotion.js";
import type { PromotionEffect } from "../../../promotions/domain/promotion-effect.js";
import type { ServedPromotionLabel } from "../../../promotions/domain/promotion-labels.js";
import { promotionScopeCovers } from "../../../promotions/domain/promotion-scope.js";
import type { OrderLineClassification } from "../ports/order-line-classification.reader.js";
import { eligibleSubtotalCents, type PricedLine } from "./pickup-discount-eligibility.js";

/**
 * **Le point PANIER d'une promotion** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.2 et § 13.5, lot L5) — pur. Ce que la remise de retrait fait
 * aujourd'hui, dit dans le vocabulaire des promotions : un montant en
 * centimes sur l'assiette des lignes couvertes, après le prix des lignes,
 * borné à elle par la même `discountCentsOf`, arrondi une fois.
 */

/** Une ligne chiffrée, et sa quantité — la condition `min_quantity` la lit. */
export interface BasketLine extends PricedLine {
  readonly quantity: number;
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
}

export const NO_BASKET_PROMOTION: BasketPromotionOutcome = {
  discountCents: 0,
  discountAdjustment: null,
  ineligibleSkus: new Set(),
  promotionId: null,
  label: null,
};

/**
 * **La promotion panier de cette commande**, parmi celles déjà admises
 * (fenêtre, pause, public, acheminement jugés).
 *
 * UNE par commande, et c'est une limite assumée jusqu'au lot L12 :
 * `composeExactOrder` ne compose qu'un `discountAdjustment`, et l'écran (L7)
 * refusera une promotion panier qui pourrait s'appliquer avec une autre sur
 * une même commande. Après la reprise il y en a au plus une — un seul point
 * de retrait par commande, une remise par clientèle (§ 13.2).
 *
 * Entre plusieurs : la plus spécifique (public — le rang de la cible qui
 * admet l'acheteur, L8b —, puis acheminement), puis la plus avantageuse pour
 * le client, puis le plus petit identifiant.
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
  let best: { outcome: BasketPromotionOutcome; rank: readonly number[] } | null = null;
  for (const promotion of candidates) {
    const outcome = outcomeOf(promotion, lines, classifications);
    if (outcome.discountCents === 0) {
      continue;
    }
    const { publicRank, fulfillmentRank } = targetingRankOf(promotion);
    const rank = [publicRank, fulfillmentRank, outcome.discountCents];
    if (best === null || beats(rank, promotion.id, best.rank, best.outcome.promotionId)) {
      best = { outcome, rank };
    }
  }
  return best?.outcome ?? NO_BASKET_PROMOTION;
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
  return {
    discountCents:
      adjustment === null
        ? 0
        : discountCentsOf(adjustment, eligibleSubtotalCents(lines, ineligibleSkus)),
    discountAdjustment: adjustment,
    ineligibleSkus,
    promotionId: promotion.id,
    label: promotion.servedLabel,
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

function beats(
  rank: readonly number[],
  id: string,
  bestRank: readonly number[],
  bestId: string | null,
): boolean {
  for (let index = 0; index < rank.length; index += 1) {
    const delta = (rank[index] ?? 0) - (bestRank[index] ?? 0);
    if (delta !== 0) {
      return delta > 0;
    }
  }
  return bestId === null || id < bestId;
}
