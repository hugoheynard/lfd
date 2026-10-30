import { discountCentsOf, type CartAdjustment } from "@lfd/contracts";
import { splitOrderByRate, ventilateVat, type VatLine } from "@lfd/money";

import {
  AmbiguousBasketDiscountsError,
  TooManyBasketDiscountsError,
} from "../../errors/basket-discount-errors.js";
import {
  chainLineHtBasketDiscounts,
  MAX_BASKET_DISCOUNTS,
  type OrderBasketDiscount,
} from "../basket-discounts.js";
import { composeExactOrder, type ExactOrderInput } from "../exact-order-composition.js";

/**
 * Lot M1 du plan des promotions (§ 18) : la commande compose une LISTE de
 * remises de panier, plafonnée, et une liste à un élément rend la remise
 * unique d'aujourd'hui au centime — mesurée ici contre `discountCentsOf`
 * (`@lfd/contracts`), la règle que la passation `line_ht` applique.
 */

const TEN_PERCENT: CartAdjustment = { mode: "percent", bp: 1000 };
const FIXED: CartAdjustment = { mode: "amount", cents: 250 };

const EXACT_LINES: ExactOrderInput["lines"] = [
  { unitPriceMillicents: 333_000, quantity: 3, saleUnit: "piece", vatRate: 5.5 },
  {
    unitPriceMillicents: 1_175_000,
    quantity: 777,
    saleUnit: "weight",
    vatRate: 5.5,
    pickupDiscountEligible: false,
  },
  { unitPriceMillicents: 412_500, quantity: 2, saleUnit: "piece", vatRate: 20 },
];

function exactInput(overrides: Partial<ExactOrderInput>): ExactOrderInput {
  return {
    lines: EXACT_LINES,
    discountAdjustment: null,
    deliveryFeeAdjustment: null,
    deliveryVatMode: null,
    voucherFaceCents: 300,
    ...overrides,
  };
}

function covering(adjustment: CartAdjustment, count: number): OrderBasketDiscount[] {
  return Array.from({ length: count }, () => ({ adjustment, coveredLines: [0, 2] }));
}

describe("composeExactOrder — une liste de remises", () => {
  it.each([
    ["pourcentage", TEN_PERCENT],
    ["montant fixe", FIXED],
  ])("une remise en liste (%s) = la remise unique, au centime", (_label, adjustment) => {
    const legacy = composeExactOrder(exactInput({ discountAdjustment: adjustment }));
    const listed = composeExactOrder(
      exactInput({ basketDiscounts: [{ adjustment, coveredLines: [0, 2] }] }),
    );

    expect(listed).toEqual(legacy);
  });

  it(`accepte ${MAX_BASKET_DISCOUNTS} remises et refuse la suivante, en le disant`, () => {
    expect(() =>
      composeExactOrder(
        exactInput({ basketDiscounts: covering(TEN_PERCENT, MAX_BASKET_DISCOUNTS) }),
      ),
    ).not.toThrow();
    expect(() =>
      composeExactOrder(
        exactInput({ basketDiscounts: covering(TEN_PERCENT, MAX_BASKET_DISCOUNTS + 1) }),
      ),
    ).toThrow(TooManyBasketDiscountsError);
  });

  it("refuse la remise unique et la liste à la fois", () => {
    expect(() =>
      composeExactOrder(exactInput({ discountAdjustment: FIXED, basketDiscounts: [] })),
    ).toThrow(AmbiguousBasketDiscountsError);
  });
});

describe("chainLineHtBasketDiscounts — le chemin line_ht", () => {
  const lines: readonly VatLine[] = [
    { htCents: 4521, vatRate: 5.5 },
    { htCents: 1000, vatRate: 20, discountEligible: false },
    { htCents: 777, vatRate: 10 },
  ];
  const eligible = [0, 2];
  const eligibleHt = 4521 + 777;

  it.each([
    ["10 %", TEN_PERCENT],
    ["12,5 %", { mode: "percent", bp: 1250 } as const],
    ["fixe", FIXED],
    ["fixe au-delà de l'assiette", { mode: "amount", cents: 99_999 } as const],
  ])("une remise (%s) = discountCentsOf et la ventilation d'aujourd'hui", (_label, adjustment) => {
    const cents = discountCentsOf(adjustment, eligibleHt);
    const legacy = { lines, eligibleDiscountCents: cents, discountCents: 0, extras: [] };
    const [step] = chainLineHtBasketDiscounts(lines, [
      { adjustment, coveredLines: eligible },
    ]).steps;

    expect(step?.amountCents).toBe(cents);
    expect(
      [...(step?.parts ?? new Map<number, number>())]
        .filter(([, amount]) => amount !== 0)
        .sort(([a], [b]) => a - b)
        .map(([vatRate, amountCents]) => ({ vatRate, amountCents })),
    ).toEqual(splitOrderByRate(legacy).eligibleDiscount);
    expect(
      ventilateVat({
        lines,
        eligibleDiscounts: [{ cents, coveredLines: eligible }],
        discountCents: 0,
        extras: [],
      }),
    ).toEqual(ventilateVat(legacy));
  });

  it("refuse une sixième remise", () => {
    expect(() => chainLineHtBasketDiscounts(lines, covering(FIXED, 6))).toThrow(
      TooManyBasketDiscountsError,
    );
  });
});
