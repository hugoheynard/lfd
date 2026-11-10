import type { CartAdjustment } from "@lfd/contracts";

import { TooManyBasketDiscountsError } from "../../errors/basket-discount-errors.js";
import { InvalidOrderPaymentError } from "../../errors/order-errors.js";
import { chainLineHtBasketDiscounts } from "../../services/basket-discounts.js";
import { ensureCumulatedShape, lineHtCumulatedStepsOf } from "../order-cumulated-discounts.js";
import type { DraftBasketDiscount } from "../order-shapes.js";

/**
 * **Les gardes des remises cumulées, en filet** (L7, 2a, 2026-11-04) —
 * déplacées d'`order-cumulated-discounts.spec.ts`. `priceBasket` ne produit
 * aucune de ces formes : chaque cas appelle la garde que l'agrégat applique
 * (`ensureCumulatedShape`, puis la chaîne rejouée de `lineHtCumulatedStepsOf`).
 */

const TEN_PERCENT: CartAdjustment = { mode: "percent", bp: 1_000 };
const FIVE_PERCENT: CartAdjustment = { mode: "percent", bp: 500 };

/** Croissants 9,31 € à 5,5 %, jus 9,51 € à 20 %, gâteau 9,00 € hors remise — HT. */
const LINES = [
  { amountCents: 931, vatRate: 5.5, eligible: true },
  { amountCents: 951, vatRate: 20, eligible: true },
  { amountCents: 900, vatRate: 5.5, eligible: false },
];

const CUMULATED: readonly DraftBasketDiscount[] = [
  {
    promotionId: "promo_a",
    adjustment: TEN_PERCENT,
    label: null,
    coveredLines: [0, 1],
    terms: null,
  },
  { promotionId: "promo_b", adjustment: FIVE_PERCENT, label: null, coveredLines: [0], terms: null },
];

const NO_SINGLE = { discountAdjustment: null, discountPromotionId: null };

function chainedHt(discounts: readonly DraftBasketDiscount[]): number {
  return chainLineHtBasketDiscounts(
    LINES.map((line) => ({ htCents: line.amountCents, vatRate: line.vatRate })),
    discounts,
  ).steps.reduce((sum, step) => sum + step.amountCents, 0);
}

describe("ensureCumulatedShape — la forme d'une commande à plusieurs remises", () => {
  it("admet la forme que la caisse produit", () => {
    expect(() => ensureCumulatedShape(NO_SINGLE, CUMULATED, LINES)).not.toThrow();
  });

  it("refuse une remise unique à côté des remises cumulées", () => {
    expect(() =>
      ensureCumulatedShape({ ...NO_SINGLE, discountAdjustment: TEN_PERCENT }, CUMULATED, LINES),
    ).toThrow(InvalidOrderPaymentError);
    expect(() =>
      ensureCumulatedShape({ ...NO_SINGLE, discountPromotionId: "promo_a" }, CUMULATED, LINES),
    ).toThrow(InvalidOrderPaymentError);
  });

  it("refuse une liste d'une seule remise : la remise unique garde son chemin", () => {
    expect(() => ensureCumulatedShape(NO_SINGLE, CUMULATED.slice(0, 1), LINES)).toThrow(
      InvalidOrderPaymentError,
    );
  });

  it("refuse un drapeau d'éligibilité qui ne vaut pas le OU des couvertures", () => {
    const narrower = CUMULATED.map((discount) => ({ ...discount, coveredLines: [0] }));
    expect(() => ensureCumulatedShape(NO_SINGLE, narrower, LINES)).toThrow(/éligibilité/u);
  });
});

describe("lineHtCumulatedStepsOf — la chaîne rejouée", () => {
  it("refuse un total que la chaîne ne redonne pas", () => {
    expect(() => lineHtCumulatedStepsOf(LINES, CUMULATED, chainedHt(CUMULATED) + 1)).toThrow(
      InvalidOrderPaymentError,
    );
  });

  it("refuse une remise que la chaîne ramène à zéro", () => {
    const exhausting: readonly DraftBasketDiscount[] = [
      {
        promotionId: "promo_a",
        adjustment: { mode: "amount", cents: 99_999 },
        label: null,
        coveredLines: [0, 1],
        terms: null,
      },
      {
        promotionId: "promo_b",
        adjustment: FIVE_PERCENT,
        label: null,
        coveredLines: [0, 1],
        terms: null,
      },
    ];
    expect(() => lineHtCumulatedStepsOf(LINES, exhausting, chainedHt(exhausting))).toThrow(
      /ne retire rien/u,
    );
  });

  it("refuse au-delà de cinq remises, en le nommant", () => {
    const six: readonly DraftBasketDiscount[] = Array.from({ length: 6 }, (_, index) => ({
      promotionId: `promo_${index}`,
      adjustment: { mode: "percent", bp: 100 },
      label: null,
      coveredLines: [0, 1],
      terms: null,
    }));
    expect(() => lineHtCumulatedStepsOf(LINES, six, 1)).toThrow(TooManyBasketDiscountsError);
  });
});
