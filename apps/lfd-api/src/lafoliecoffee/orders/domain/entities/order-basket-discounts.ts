import type { CartAdjustment } from "@lfd/contracts";
import { chainBasketDiscounts, roundToCents, type TtcOrderComposition } from "@lfd/money";

import { InvalidOrderPaymentError } from "../errors/order-errors.js";
import { chainLineHtBasketDiscounts } from "../services/basket-discounts.js";
import type { FrozenDiscountTerms } from "../services/frozen-discount-terms.js";
import type { DiscountVatShare } from "../services/order-discount-recovery-shapes.js";
import type { DraftOrderInput, OrderDiscountLabel } from "./order-shapes.js";

/**
 * **Les remises de panier qu'une commande fige, une ligne par remise** —
 * `documentation/promotions/promotions.md`, § 2.11, lot M3. Ce que la passation et la révision écrivent dans
 * `order_discounts`, à côté des colonnes `discount_*` qui restent écrites.
 *
 * Calculé par l'agrégat, par la fonction de M1 : le déclencheur strict exige
 * que la somme des montants égale `orders.discount_cents`, et c'est l'agrégat
 * qui fige l'un et l'autre dans la même composition.
 *
 * Depuis M7, plusieurs remises quand des promotions panier cumulables
 * s'enchaînent (`order-cumulated-discounts.ts`) ; une remise de montant nul
 * n'a pas de ligne (§ 18.2 : une part vide ne somme à rien).
 */

/** Les montants d'une étape, tels que la commande les fige. */
export interface BasketDiscountStepAmounts {
  /**
   * L'assiette de l'étape, au centime le plus proche (moitié vers le haut) :
   * information seulement, jamais relue pour calculer (§ 18.2).
   */
  readonly baseCents: number;
  /** HT, positif — la part de `discount_cents`. */
  readonly amountCents: number;
  /** Son TTC — commande `exact_ht` seulement. */
  readonly amountTtcCents: number | null;
  /** Une part par taux ; Σ `htCents` = `amountCents`. */
  readonly vatShares: readonly DiscountVatShare[];
  /** Les indices des lignes couvertes, dans l'ordre des lignes de la commande. */
  readonly coveredLines: readonly number[];
}

/** Une remise appliquée : ses montants, et ce qui l'a produite, figé. */
export interface AppliedBasketDiscount extends BasketDiscountStepAmounts, BasketDiscountTrace {
  /** À partir de 1 — l'ordre d'application, figé (§ 18.4). */
  readonly rank: number;
}

/** Une ligne vue par l'étape : son montant (HT ou TTC selon le chemin), son taux, sa couverture. */
interface StepLine {
  readonly amountCents: number;
  readonly vatRate: number;
  readonly eligible: boolean;
}

/**
 * `line_ht` : l'étape de rang 1 sur les lignes éligibles, au HT. Son montant
 * DOIT être celui que la commande fige (`ensureDiscountMatches` l'a jugé par
 * la formule d'hier, M1 tient l'égalité) ; un écart se refuse plutôt que
 * d'écrire une remise que le déclencheur refuserait au COMMIT.
 *
 * @throws {InvalidOrderPaymentError} la chaîne ne redonne pas `discountCents`.
 */
export function lineHtBasketStepsOf(
  lines: readonly StepLine[],
  adjustment: CartAdjustment | null,
  discountCents: number,
): readonly BasketDiscountStepAmounts[] {
  if (adjustment === null || discountCents === 0) {
    return [];
  }
  const coveredLines = coveredOf(lines);
  const chain = chainLineHtBasketDiscounts(
    lines.map((line) => ({ htCents: line.amountCents, vatRate: line.vatRate })),
    [{ adjustment, coveredLines }],
  );
  const step = chain.steps[0];
  if (step === undefined || step.amountCents !== discountCents) {
    throw new InvalidOrderPaymentError(
      `La remise retenue (${discountCents} c HT) ne se ventile pas sur ses lignes ` +
        `(${step?.amountCents ?? 0} c) : la commande n'est pas enregistrée. Prévenir l'équipe technique.`,
    );
  }
  return [
    {
      baseCents: roundToCents(step.base),
      amountCents: step.amountCents,
      amountTtcCents: null,
      vatShares: [...step.parts]
        .sort(([left], [right]) => left - right)
        .map(([rate, htCents]) => ({ rate, htCents })),
      coveredLines,
    },
  ];
}

/**
 * `exact_ht` : le terme de rang 1 de la composition que l'agrégat vient de
 * rejouer — HT, TTC et parts par taux tels qu'ils entrent dans le total.
 * L'assiette se relit sur les TTC de ligne composés, par la même chaîne.
 */
export function exactBasketStepsOf(
  lines: readonly { readonly eligible: boolean }[],
  composition: TtcOrderComposition,
  adjustment: CartAdjustment | null,
): readonly BasketDiscountStepAmounts[] {
  const term = composition.basketDiscounts[0];
  if (adjustment === null || term === undefined || (term.htCents === 0 && term.ttcCents === 0)) {
    return [];
  }
  const coveredLines = coveredOf(lines);
  const chain = chainBasketDiscounts(
    composition.lines.map((line) => ({ amountCents: line.ttcCents, vatRate: line.vatRate })),
    [{ adjustment, coveredLines }],
    "exact_ht",
  );
  const base = chain.steps[0]?.base;
  return [
    {
      baseCents: base === undefined ? 0 : roundToCents(base),
      amountCents: term.htCents,
      amountTtcCents: term.ttcCents,
      vatShares: [...term.parts]
        .sort((left, right) => left.vatRate - right.vatRate)
        .map((part) => ({
          rate: part.vatRate,
          htCents: part.htCents,
          vatCents: part.vatCents,
          ttcCents: part.ttcCents,
        })),
      coveredLines,
    },
  ];
}

/** Ce qui a produit une étape, figé : sa promotion, son ajustement, son libellé. */
export interface BasketDiscountTrace {
  readonly promotionId: string | null;
  readonly adjustment: CartAdjustment;
  readonly label: OrderDiscountLabel | null;
  /** Les termes figés, que la révision rejoue (plan des remises acquises) ; `null` = inconnus. */
  readonly terms: FrozenDiscountTerms | null;
}

/**
 * Les étapes, avec ce qui les a produites — une trace par étape, dans le
 * même ordre. La remise unique d'hier a pour trace les colonnes `discount_*`
 * ({@link singleBasketTraces}) ; des remises cumulées (lot M7), chacune la
 * sienne.
 */
export function appliedBasketDiscountsOf(
  steps: readonly BasketDiscountStepAmounts[],
  traces: readonly BasketDiscountTrace[],
): readonly AppliedBasketDiscount[] {
  return steps.flatMap((step, index) => {
    const trace = traces[index];
    return trace === undefined ? [] : [{ ...step, rank: index + 1, ...trace }];
  });
}

/** La trace de la remise unique : les colonnes figées, ou aucune sans ajustement. */
export function singleBasketTraces(trace: {
  readonly promotionId: string | null;
  readonly adjustment: CartAdjustment | null;
  readonly label: OrderDiscountLabel | null;
  readonly terms: FrozenDiscountTerms | null;
}): readonly BasketDiscountTrace[] {
  const { adjustment } = trace;
  return adjustment === null ? [] : [{ ...trace, adjustment }];
}

/**
 * Ce qui a produit chaque étape de remise : les remises cumulées une à une
 * (lot M7), ou la remise unique des colonnes `discount_*`.
 */
export function basketTracesOf(input: DraftOrderInput): readonly BasketDiscountTrace[] {
  if (input.basketDiscounts !== undefined) {
    return input.basketDiscounts.map(({ promotionId, adjustment, label, terms }) => ({
      promotionId,
      adjustment,
      label,
      terms,
    }));
  }
  return singleBasketTraces({
    promotionId: input.discountPromotionId ?? null,
    adjustment: input.discountAdjustment,
    label: input.discountLabel ?? null,
    terms: input.discountTerms ?? null,
  });
}

function coveredOf(lines: readonly { readonly eligible: boolean }[]): readonly number[] {
  return lines.flatMap((line, index) => (line.eligible ? [index] : []));
}
