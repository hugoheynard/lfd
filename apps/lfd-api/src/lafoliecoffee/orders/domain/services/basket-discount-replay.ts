import { discountCentsOf, type CartAdjustment } from "@lfd/contracts";
import { chainBasketDiscounts } from "@lfd/money";

import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import type { DraftBasketDiscount, OrderDiscountLabel } from "../entities/order-shapes.js";
import type { OrderLineSnapshot } from "../value-objects/order-line.js";
import { MULTIPLE_BASKET_DISCOUNTS_LABEL, type BasketLine } from "./basket-promotion-choice.js";
import type { FrozenDiscountTerms } from "./frozen-discount-terms.js";
import type { FrozenBasketDiscount } from "./frozen-basket-discounts.js";
import { eligibleSubtotalCents } from "./pickup-discount-eligibility.js";

/**
 * **Les remises de panier d'une commande, REJOUÉES sur sa révision** —
 * `documentation/promotions/plan-remises-acquises.md`, § 10.2. Pur.
 *
 * Rejouées, jamais rejugées : les remises actives de la commande, avec leur
 * ajustement, leur rang, leurs SKU couverts et leurs termes figés — à la
 * manière d'un bon partiel (`noteBasketDiscountsOf`, qui couvre par SKU comme
 * `coveredLinesOf`). Aucune promotion du moment n'est ajoutée ; une
 * promotion archivée depuis reste acquise ; un SKU neuf n'en reçoit aucune.
 *
 * - Un SKU couvert retiré sort de l'assiette ; une remise dont tous les SKU
 *   sont retirés disparaît — il n'y a plus rien à remiser.
 * - Le seuil figé (`min_quantity`) se rejuge sur la quantité révisée : une
 *   ligne couverte qui passe dessous est un REFUS, jamais une perte
 *   silencieuse.
 * - Le plan choisi à la passation (M7) est rejoué tel quel, dans l'ordre des
 *   rangs : la comparaison n'est pas refaite.
 * - Une remise reprise sans ajustement (`origin = frozen`) garde son montant
 *   figé, borné à l'assiette restante de ses SKU.
 */

/** Une remise active, telle que la révision la rejoue. */
export interface RevisableDiscount extends FrozenBasketDiscount {
  /** Le libellé figé, trois langues ; `null` sans libellé. */
  readonly servedLabel: OrderDiscountLabel | null;
  /** Le montant figé, HT — ce que garde une remise sans ajustement. */
  readonly amountCents: number;
  /** Son TTC, commande `exact_ht` seulement. */
  readonly amountTtcCents: number | null;
  /** Les termes figés ; `null` = inconnus (remise pas encore reprise). */
  readonly terms: FrozenDiscountTerms | null;
}

/** Ce que la commande porte pour rejouer ses remises, colonnes comprises. */
export interface ReplayableOrder {
  readonly activeDiscounts: readonly RevisableDiscount[];
  readonly discountPromotionId: string | null;
  readonly discountAdjustment: CartAdjustment | null;
  readonly discountLabel: OrderDiscountLabel | null;
  /** HT. */
  readonly discountCents: number;
  readonly discountTtcCents: number | null;
}

/**
 * Les remises à rejouer : la table si la commande y a des lignes actives,
 * sinon les colonnes `discount_*` comme une remise de rang 1 — le repli de
 * `frozenBasketDiscountsOf`, à ceci près qu'une remise figée SANS ajustement
 * est gardée à son montant au lieu d'être oubliée.
 */
export function replayableDiscountsOf(order: ReplayableOrder): readonly RevisableDiscount[] {
  if (order.activeDiscounts.length > 0) {
    return order.activeDiscounts;
  }
  if (order.discountAdjustment === null && order.discountCents <= 0) {
    return [];
  }
  return [
    {
      orderDiscountId: null,
      promotionId: order.discountPromotionId,
      adjustment: order.discountAdjustment,
      label: order.discountLabel?.fr ?? null,
      servedLabel: order.discountLabel,
      coveredSkus: null,
      amountCents: order.discountCents,
      amountTtcCents: order.discountTtcCents,
      terms: null,
    },
  ];
}

/** Une remise que la révision ferait perdre parce qu'une ligne passe sous son seuil. */
export interface BasketDiscountRefusal {
  readonly kind: "below_threshold";
  readonly label: OrderDiscountLabel | null;
  readonly minQuantity: number;
  readonly sku: string;
  readonly quantity: number;
}

/** La forme que la composition attend de l'acheminement — la même que celle de la caisse. */
export interface ReplayedBasket {
  readonly discountCents: number;
  readonly discountAdjustment: CartAdjustment | null;
  readonly discountLabel: OrderDiscountLabel | null;
  readonly discountPromotionId: string | null;
  readonly discountTerms: FrozenDiscountTerms | null;
  readonly ineligibleSkus: ReadonlySet<string>;
  /** À partir de deux remises gardées ; `undefined` sinon. */
  readonly basketDiscounts: readonly DraftBasketDiscount[] | undefined;
  readonly refusals: readonly BasketDiscountRefusal[];
}

/** Une étape gardée : la remise, son ajustement, ses lignes sur la révision. */
interface ReplayStep {
  readonly discount: RevisableDiscount;
  readonly adjustment: CartAdjustment;
  readonly coveredLines: readonly number[];
}

/**
 * @param previous les lignes de la révision courante — ce que couvre une
 *   remise lue dans les colonnes (`pickup_discount_eligible`).
 * @param lines les lignes révisées, chiffrées, dans l'ordre de la commande.
 */
export function replayBasketDiscounts(
  discounts: readonly RevisableDiscount[],
  previous: readonly OrderLineSnapshot[],
  lines: readonly BasketLine[],
): ReplayedBasket {
  const exact = lines.length > 0 && lines.every((line) => line.exact !== undefined);
  const candidates = discounts.flatMap((discount): ReplayStep[] => {
    const skus = new Set(discount.coveredSkus ?? eligibleSkusOf(previous));
    const coveredLines = lines.flatMap((line, index) => (skus.has(line.sku) ? [index] : []));
    return coveredLines.length === 0
      ? []
      : [{ discount, adjustment: adjustmentOf(discount, exact), coveredLines }];
  });
  const refusals = candidates.flatMap((step) => thresholdRefusals(step, lines));
  const chain = chainBasketDiscounts(
    lines.map((line) =>
      exact && line.exact !== undefined
        ? { amountCents: line.exact.ttcCents, vatRate: line.exact.vatRate }
        : { amountCents: line.htCents, vatRate: 0 },
    ),
    candidates.map(({ adjustment, coveredLines }) => ({ adjustment, coveredLines })),
    exact ? "exact_ht" : "line_ht",
  );
  const kept = candidates.flatMap((step, index) => {
    const amount = chain.steps[index]?.amountCents ?? 0;
    return amount === 0 ? [] : [{ step, amount }];
  });
  return { ...shapeOf(kept, lines), refusals };
}

/** La remise unique d'hier, plusieurs remises cumulées, ou aucune. */
function shapeOf(
  kept: readonly { readonly step: ReplayStep; readonly amount: number }[],
  lines: readonly BasketLine[],
): Omit<ReplayedBasket, "refusals"> {
  const covered = new Set(kept.flatMap(({ step }) => step.coveredLines));
  const ineligibleSkus = new Set(
    lines.filter((_, index) => !covered.has(index)).map((line) => line.sku),
  );
  const [only] = kept;
  if (only === undefined) {
    return NOTHING;
  }
  if (kept.length === 1) {
    const { discount, adjustment } = only.step;
    return {
      discountCents: discountCentsOf(adjustment, eligibleSubtotalCents(lines, ineligibleSkus)),
      discountAdjustment: adjustment,
      discountLabel: discount.servedLabel,
      discountPromotionId: discount.promotionId,
      discountTerms: discount.terms,
      ineligibleSkus,
      basketDiscounts: undefined,
    };
  }
  return {
    discountCents: kept.reduce((sum, { amount }) => sum + amount, 0),
    discountAdjustment: null,
    discountLabel: MULTIPLE_BASKET_DISCOUNTS_LABEL,
    discountPromotionId: null,
    discountTerms: null,
    ineligibleSkus,
    basketDiscounts: kept.map(({ step }) => cumulatedOf(step)),
  };
}

const NOTHING: Omit<ReplayedBasket, "refusals"> = {
  discountCents: 0,
  discountAdjustment: null,
  discountLabel: null,
  discountPromotionId: null,
  discountTerms: null,
  ineligibleSkus: new Set(),
  basketDiscounts: undefined,
};

/** @throws {UnidentifiedCumulatedDiscountError} une remise cumulée sans promotion. */
function cumulatedOf(step: ReplayStep): DraftBasketDiscount {
  const { discount } = step;
  if (discount.promotionId === null) {
    throw new UnidentifiedCumulatedDiscountError(discount.orderDiscountId);
  }
  return {
    promotionId: discount.promotionId,
    adjustment: step.adjustment,
    label: discount.servedLabel,
    coveredLines: step.coveredLines,
    terms: discount.terms,
  };
}

/**
 * Plusieurs remises ne viennent que de promotions cumulables (M7), qui ont
 * toutes un identifiant : une remise sans promotion parmi elles est une
 * donnée que la passation ne produit pas.
 */
class UnidentifiedCumulatedDiscountError extends TechnicalError {
  constructor(orderDiscountId: string | null) {
    super(
      "orders.revise.unidentified_cumulated_discount",
      `La remise ${orderDiscountId ?? "(colonnes)"} est cumulée sans promotion : ` +
        "la commande ne peut pas être recomposée. Prévenir l'équipe technique.",
    );
  }
}

/** L'ajustement figé, ou — remise reprise sans ajustement — son montant figé, borné par la chaîne. */
function adjustmentOf(discount: RevisableDiscount, exact: boolean): CartAdjustment {
  if (discount.adjustment !== null) {
    return discount.adjustment;
  }
  const cents = exact ? (discount.amountTtcCents ?? discount.amountCents) : discount.amountCents;
  return { mode: "amount", cents };
}

function thresholdRefusals(
  step: ReplayStep,
  lines: readonly BasketLine[],
): BasketDiscountRefusal[] {
  const minQuantity = step.discount.terms?.minQuantity ?? null;
  if (minQuantity === null) {
    return [];
  }
  return step.coveredLines.flatMap((index) => {
    const line = lines[index];
    return line === undefined || line.quantity >= minQuantity
      ? []
      : [
          {
            kind: "below_threshold" as const,
            label: step.discount.servedLabel,
            minQuantity,
            sku: line.sku,
            quantity: line.quantity,
          },
        ];
  });
}

function eligibleSkusOf(previous: readonly OrderLineSnapshot[]): readonly string[] {
  return previous.filter((line) => line.pickupDiscountEligible).map((line) => line.sku);
}
