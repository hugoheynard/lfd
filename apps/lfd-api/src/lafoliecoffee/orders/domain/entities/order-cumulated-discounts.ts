import type { VatBasketDiscount } from "@lfd/money";
import { chainBasketDiscounts, roundToCents, type TtcOrderComposition } from "@lfd/money";

import { InvalidOrderPaymentError } from "../errors/order-errors.js";
import { chainLineHtBasketDiscounts } from "../services/basket-discounts.js";
import type { BasketDiscountStepAmounts } from "./order-basket-discounts.js";
import type { DraftBasketDiscount, DraftOrderInput } from "./order-shapes.js";

/**
 * **Plusieurs remises de panier sur une commande** — `documentation/promotions/promotions.md`, § 2.11
 * (point PANIER, étape 3), § 18.4 et § 18.6, lot M7.
 *
 * L'agrégat ne fait confiance à aucun appelant : il rejoue la chaîne de M1
 * (`chainBasketDiscounts`) sur SES lignes, et exige qu'elle redonne le total
 * reçu. La remise unique d'hier ne passe pas par ici — elle garde ses gardes
 * et son chemin, au centime.
 */

/** Les lignes telles que la chaîne les voit : montant (HT ou TTC selon le chemin), taux, drapeau. */
interface CumulatedLine {
  readonly amountCents: number;
  readonly vatRate: number;
  readonly eligible: boolean;
}

/**
 * La forme d'une commande à plusieurs remises : deux au moins, sans trace de
 * remise unique, et un drapeau par ligne qui vaut le OU des couvertures —
 * c'est lui que les lecteurs d'hier lisent (`pickup_discount_eligible`).
 *
 * @throws {InvalidOrderPaymentError} une forme que la composition ne produit pas.
 */
export function ensureCumulatedShape(
  input: Pick<DraftOrderInput, "discountAdjustment" | "discountPromotionId">,
  discounts: readonly DraftBasketDiscount[],
  lines: readonly { readonly eligible: boolean }[],
): void {
  if (discounts.length < 2) {
    throw refused("une liste de remises cumulées en porte au moins deux");
  }
  if (input.discountAdjustment !== null || (input.discountPromotionId ?? null) !== null) {
    throw refused("des remises cumulées ne portent pas de remise unique à côté");
  }
  const covered = new Set(discounts.flatMap((discount) => discount.coveredLines));
  if (lines.some((line, index) => line.eligible !== covered.has(index))) {
    throw refused("l'éligibilité d'une ligne ne correspond pas aux remises qui la couvrent");
  }
}

/**
 * `line_ht` : les étapes, au HT, et leur forme pour `ventilateVat`.
 *
 * @throws {InvalidOrderPaymentError} la chaîne ne redonne pas `discountCents`, ou une étape est nulle.
 * @throws {TooManyBasketDiscountsError} au-delà du plafond.
 */
export function lineHtCumulatedStepsOf(
  lines: readonly CumulatedLine[],
  discounts: readonly DraftBasketDiscount[],
  discountCents: number,
): {
  readonly steps: readonly BasketDiscountStepAmounts[];
  readonly eligibleDiscounts: readonly VatBasketDiscount[];
} {
  const chain = chainLineHtBasketDiscounts(
    lines.map((line) => ({ htCents: line.amountCents, vatRate: line.vatRate })),
    discounts,
  );
  ensureChainMatches(
    chain.steps.map((step) => step.amountCents),
    discountCents,
  );
  return {
    steps: chain.steps.map((step, index) => ({
      baseCents: roundToCents(step.base),
      amountCents: step.amountCents,
      amountTtcCents: null,
      vatShares: [...step.parts]
        .sort(([left], [right]) => left - right)
        .map(([rate, htCents]) => ({ rate, htCents })),
      coveredLines: discounts[index]?.coveredLines ?? [],
    })),
    eligibleDiscounts: chain.steps.map((step, index) => ({
      cents: step.amountCents,
      coveredLines: discounts[index]?.coveredLines ?? [],
    })),
  };
}

/**
 * `exact_ht` : les termes de la composition que l'agrégat vient de rejouer
 * avec la liste — HT, TTC et parts par taux tels qu'ils entrent dans le
 * total. L'assiette de chaque étape se relit sur les TTC de ligne composés.
 *
 * @throws {InvalidOrderPaymentError} le TTC composé ne redonne pas `discountCents`, ou une étape est nulle.
 */
export function exactCumulatedStepsOf(
  composition: TtcOrderComposition,
  discounts: readonly DraftBasketDiscount[],
  discountTtcCents: number,
): readonly BasketDiscountStepAmounts[] {
  ensureChainMatches(
    composition.basketDiscounts.map((term) => term.ttcCents),
    discountTtcCents,
  );
  const chain = chainBasketDiscounts(
    composition.lines.map((line) => ({ amountCents: line.ttcCents, vatRate: line.vatRate })),
    discounts,
    "exact_ht",
  );
  return composition.basketDiscounts.map((term, index) => {
    const base = chain.steps[index]?.base;
    return {
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
      coveredLines: discounts[index]?.coveredLines ?? [],
    };
  });
}

/**
 * Chaque étape retire quelque chose — une remise nulle ne concourt pas
 * (`basketPromotionPlanOf`), et n'aurait pas de ligne en table — et leur
 * somme est le montant reçu.
 */
function ensureChainMatches(amounts: readonly number[], receivedCents: number): void {
  if (amounts.some((amount) => amount <= 0)) {
    throw refused("une remise cumulée ne retire rien à cette commande");
  }
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  if (total !== receivedCents) {
    throw new InvalidOrderPaymentError(
      `Les remises cumulées retirent ${total} c, la commande en annonce ${receivedCents} c : ` +
        "la commande n'est pas enregistrée. Relancer le devis, puis valider de nouveau.",
    );
  }
}

function refused(reason: string): InvalidOrderPaymentError {
  return new InvalidOrderPaymentError(
    `Remises de panier incohérentes : ${reason}. La commande n'est pas enregistrée ; prévenir l'équipe technique.`,
  );
}
