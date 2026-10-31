import type { CartAdjustment } from "@lfd/contracts";
import { chainBasketDiscounts } from "@lfd/money";

import {
  targetingRankOf,
  type AdmittedPromotion,
} from "../../../promotions/domain/live-promotion.js";
import type { ServedPromotionLabel } from "../../../promotions/domain/promotion-labels.js";
import type { DraftBasketDiscount } from "../entities/order-shapes.js";
import { MAX_BASKET_DISCOUNTS } from "./basket-discounts.js";
import type { BasketLine } from "./basket-promotion-choice.js";

/**
 * **Les remises de panier d'une commande, choisies** — plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 16.1 (point PANIER, étapes 1 et 2) et § 18.6, lot M7. Pur.
 *
 * 1. Les non cumulables, triées par le rang de la caisse (public,
 *    acheminement, montant, id), sont retenues tant que leurs lignes ne
 *    croisent pas celles d'une déjà retenue — **une par article**.
 * 2. Les cumulables forment une chaîne triée par (public, acheminement, id).
 * 3. Deux plans se comparent au montant total HT : « non cumulable » (les
 *    retenues, plus les cumulables qui n'en croisent aucune) et « cumulé »
 *    (toute la chaîne, plus les retenues qui ne croisent aucune cumulable).
 *    Le plus fort l'emporte ; à égalité, « non cumulable ».
 *
 * L'ordre d'application est celui du plan : non cumulables, puis cumulables.
 * Une étape que la chaîne ramène à zéro (assiette épuisée par les
 * précédentes) est retirée : une remise qui ne retire rien ne concourt pas,
 * et n'a pas de ligne en table (§ 18.2).
 *
 * Le plafond de cinq remises : la pose refuse une sixième cumulable
 * (`assertCumulativeBasketCapacity`) ; ici, défense en profondeur, les cinq
 * premières sont gardées et les autres rendues pour être journalisées — le
 * devis et la passation ne lèvent jamais (décision du 2026-10-31, mandat).
 */

/** Une promotion qui retire quelque chose de ce panier, seule. */
export interface BasketCandidate {
  readonly promotion: AdmittedPromotion;
  readonly adjustment: CartAdjustment;
  /** Ce qu'elle retirerait seule, HT — le départage de la caisse. */
  readonly aloneCents: number;
  readonly ineligibleSkus: ReadonlySet<string>;
}

/** Une remise retenue, dans l'ordre d'application. */
export interface BasketPromotionApplied {
  readonly promotionId: string;
  readonly adjustment: CartAdjustment;
  readonly label: ServedPromotionLabel;
  /** Les SKU qu'ELLE ne couvre pas. */
  readonly ineligibleSkus: ReadonlySet<string>;
  /** Son étape, positive, dans l'unité de la commande : HT (`line_ht`) ou TTC (`exact_ht`). */
  readonly discountCents: number;
}

/** Les remises retenues, et celles que le plafond a écartées. */
export interface BasketPromotionPlan {
  /** Dans l'ordre d'application (vide : aucune), au plus {@link MAX_BASKET_DISCOUNTS}. */
  readonly applied: readonly BasketPromotionApplied[];
  /** Les promotions au-delà du plafond, écartées — à journaliser par l'appelant. */
  readonly beyondCap: readonly string[];
}

/**
 * Les remises retenues. Les deux plans se comparent **dans l'unité de la
 * commande** (décision du 2026-10-31, mandat) : en TTC quand chaque ligne
 * porte son TTC (`exact_ht`, ce que le particulier paie), sinon en HT.
 */
export function basketPromotionPlanOf(
  candidates: readonly BasketCandidate[],
  lines: readonly BasketLine[],
): BasketPromotionPlan {
  const exclusive = candidates
    .filter((candidate) => !candidate.promotion.cumulative)
    .sort((left, right) => compareRanks(rankOf(right, true), rankOf(left, true), left, right));
  const retained: BasketCandidate[] = [];
  for (const candidate of exclusive) {
    if (retained.every((kept) => disjoint(kept, candidate, lines))) {
      retained.push(candidate);
    }
  }
  const chain = candidates
    .filter((candidate) => candidate.promotion.cumulative)
    .sort((left, right) => compareRanks(rankOf(right, false), rankOf(left, false), left, right));
  const exclusivePlan = capped(
    applied(
      [
        ...retained,
        ...chain.filter((link) => retained.every((kept) => disjoint(kept, link, lines))),
      ],
      lines,
    ),
  );
  const cumulatedPlan = capped(
    applied(
      [...retained.filter((kept) => chain.every((link) => disjoint(kept, link, lines))), ...chain],
      lines,
    ),
  );
  return totalOf(cumulatedPlan.applied) > totalOf(exclusivePlan.applied)
    ? cumulatedPlan
    : exclusivePlan;
}

/**
 * Défense en profondeur (décision du 2026-10-31, mandat) : la pose refuse une
 * sixième cumulable, mais une caisse ne tombe jamais — au-delà du plafond, les
 * premières dans l'ordre du § 16.1 sont gardées, les autres écartées et
 * nommées. Une étape ne dépend que des précédentes : couper la fin ne change
 * pas les montants gardés.
 */
function capped(steps: readonly BasketPromotionApplied[]): BasketPromotionPlan {
  return {
    applied: steps.slice(0, MAX_BASKET_DISCOUNTS),
    beyondCap: steps.slice(MAX_BASKET_DISCOUNTS).map((step) => step.promotionId),
  };
}

/** Le rang de tri : public, acheminement, puis — non cumulable seulement — le montant seul. */
function rankOf(candidate: BasketCandidate, withAmount: boolean): readonly number[] {
  const { publicRank, fulfillmentRank } = targetingRankOf(candidate.promotion);
  return withAmount
    ? [publicRank, fulfillmentRank, candidate.aloneCents]
    : [publicRank, fulfillmentRank];
}

/** Rang décroissant (déjà inversé par l'appelant), puis identifiant croissant. */
function compareRanks(
  first: readonly number[],
  second: readonly number[],
  left: BasketCandidate,
  right: BasketCandidate,
): number {
  for (let index = 0; index < first.length; index += 1) {
    const delta = (first[index] ?? 0) - (second[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return left.promotion.id < right.promotion.id
    ? -1
    : left.promotion.id > right.promotion.id
      ? 1
      : 0;
}

/** Deux promotions ne couvrent-elles aucune ligne commune ? */
function disjoint(
  left: BasketCandidate,
  right: BasketCandidate,
  lines: readonly BasketLine[],
): boolean {
  return !lines.some(
    (line) => !left.ineligibleSkus.has(line.sku) && !right.ineligibleSkus.has(line.sku),
  );
}

/**
 * La chaîne dans l'unité de la commande, sans les étapes nulles : `exact_ht`
 * sur les TTC de ligne quand chacune porte le sien, sinon `line_ht` sur les HT.
 */
function applied(
  plan: readonly BasketCandidate[],
  lines: readonly BasketLine[],
): readonly BasketPromotionApplied[] {
  const exact = lines.every((line) => line.exact !== undefined);
  const chain = chainBasketDiscounts(
    lines.map((line) =>
      exact && line.exact !== undefined
        ? { amountCents: line.exact.ttcCents, vatRate: line.exact.vatRate }
        : { amountCents: line.htCents, vatRate: 0 },
    ),
    plan.map((candidate) => ({
      adjustment: candidate.adjustment,
      coveredLines: coveredLinesOf(lines, candidate.ineligibleSkus),
    })),
    exact ? "exact_ht" : "line_ht",
  );
  return plan.flatMap((candidate, index) => {
    const amount = chain.steps[index]?.amountCents ?? 0;
    return amount === 0
      ? []
      : [
          {
            promotionId: candidate.promotion.id,
            adjustment: candidate.adjustment,
            label: candidate.promotion.servedLabel,
            ineligibleSkus: candidate.ineligibleSkus,
            discountCents: amount,
          },
        ];
  });
}

function totalOf(plan: readonly BasketPromotionApplied[]): number {
  return plan.reduce((sum, step) => sum + step.discountCents, 0);
}

/** Les indices des lignes qu'une remise couvre — par SKU, donc toutes les lignes d'un SKU ensemble. */
export function coveredLinesOf(
  lines: readonly { readonly sku: string }[],
  ineligibleSkus: ReadonlySet<string>,
): readonly number[] {
  return lines.flatMap((line, index) => (ineligibleSkus.has(line.sku) ? [] : [index]));
}

/**
 * Les remises cumulées que la commande porte (lot M7) — à partir de DEUX ;
 * `undefined` pour la remise unique d'hier ou aucune, qui gardent leur
 * chemin. Chaque remise couvre ses lignes par SKU : toutes les lignes d'un
 * même SKU ensemble, ce que le bon partiel exige (§ 18.6, condition de M7).
 */
export function cumulatedDiscountsOf(
  lines: readonly { readonly sku: string }[],
  applied: readonly BasketPromotionApplied[],
): readonly DraftBasketDiscount[] | undefined {
  if (applied.length < 2) {
    return undefined;
  }
  return applied.map((discount) => ({
    promotionId: discount.promotionId,
    adjustment: discount.adjustment,
    label: discount.label,
    coveredLines: coveredLinesOf(lines, discount.ineligibleSkus),
  }));
}
