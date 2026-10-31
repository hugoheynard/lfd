import type { CartAdjustment } from "@lfd/contracts";

import type { OrderLineSnapshot } from "../../value-objects/order-line.js";
import {
  replayableDiscountsOf,
  replayBasketDiscounts,
  type RevisableDiscount,
} from "../basket-discount-replay.js";
import type { BasketLine } from "../basket-promotion-choice.js";
import type { FrozenDiscountTerms } from "../frozen-discount-terms.js";

/**
 * **Les remises de panier REJOUÉES, jamais rejugées**
 * (`documentation/promotions/plan-remises-acquises.md`, § 10.2) — pur : aucune
 * promotion vivante n'est lue, une promotion archivée depuis n'existe donc
 * même pas ici, et sa remise reste.
 */

const TEN_PERCENT: CartAdjustment = { mode: "percent", bp: 1_000 };
const FIVE_PERCENT: CartAdjustment = { mode: "percent", bp: 500 };
const LABEL = { fr: "Dès 10", en: "From 10", it: "Da 10" };

function terms(over: Partial<FrozenDiscountTerms> = {}): FrozenDiscountTerms {
  return {
    cumulative: false,
    minQuantity: null,
    pickup: "all",
    delivery: "none",
    origin: "placed",
    ...over,
  };
}

function discount(over: Partial<RevisableDiscount> = {}): RevisableDiscount {
  return {
    orderDiscountId: "od_1",
    promotionId: "promo_archived",
    adjustment: TEN_PERCENT,
    label: LABEL.fr,
    servedLabel: LABEL,
    coveredSkus: ["VIE-001"],
    amountCents: 200,
    amountTtcCents: null,
    terms: terms(),
    ...over,
  };
}

/** Une ligne révisée : 2,00 € HT la pièce. */
function line(sku: string, quantity: number): BasketLine {
  return { sku, quantity, htCents: quantity * 200 };
}

describe("replayBasketDiscounts", () => {
  it("garde la remise d'une promotion archivée depuis, sur la quantité baissée", () => {
    const replayed = replayBasketDiscounts([discount()], [], [line("VIE-001", 5)]);

    expect(replayed).toMatchObject({
      discountCents: 100,
      discountAdjustment: TEN_PERCENT,
      discountPromotionId: "promo_archived",
      discountLabel: LABEL,
      basketDiscounts: undefined,
      refusals: [],
    });
    expect(replayed.discountTerms).toEqual(terms());
  });

  it("ne donne aucune remise à un SKU neuf", () => {
    const replayed = replayBasketDiscounts(
      [discount()],
      [],
      [line("VIE-001", 5), line("PAI-001", 3)],
    );

    expect([...replayed.ineligibleSkus]).toEqual(["PAI-001"]);
    expect(replayed.discountCents).toBe(100);
  });

  it("une remise dont tous les SKU sont retirés disparaît, sans refus", () => {
    const replayed = replayBasketDiscounts([discount()], [], [line("PAI-001", 3)]);

    expect(replayed).toMatchObject({
      discountCents: 0,
      discountAdjustment: null,
      discountPromotionId: null,
      refusals: [],
    });
  });

  describe("le seuil figé (`min_quantity`)", () => {
    const fromTen = discount({ terms: terms({ minQuantity: 10 }) });

    it("refuse — sans perte silencieuse — une ligne couverte qui passe sous le seuil", () => {
      const replayed = replayBasketDiscounts([fromTen], [], [line("VIE-001", 1)]);

      expect(replayed.refusals).toEqual([
        { kind: "below_threshold", label: LABEL, minQuantity: 10, sku: "VIE-001", quantity: 1 },
      ]);
    });

    it("laisse passer une baisse qui reste au seuil", () => {
      expect(replayBasketDiscounts([fromTen], [], [line("VIE-001", 10)]).refusals).toEqual([]);
    });

    it("ne refuse pas une ligne retirée entièrement : il n'y a plus rien à remiser", () => {
      expect(replayBasketDiscounts([fromTen], [], [line("PAI-001", 1)]).refusals).toEqual([]);
    });

    it("des termes inconnus (remise pas encore reprise) ne disent aucun seuil", () => {
      const unknown = discount({ terms: null });

      expect(replayBasketDiscounts([unknown], [], [line("VIE-001", 1)]).refusals).toEqual([]);
    });
  });

  it("rejoue deux remises cumulées dans l'ordre figé, sans recomparer les plans", () => {
    const replayed = replayBasketDiscounts(
      [
        discount({ promotionId: "promo_a", terms: terms({ cumulative: true }) }),
        discount({
          orderDiscountId: "od_2",
          promotionId: "promo_b",
          adjustment: FIVE_PERCENT,
          terms: terms({ cumulative: true }),
        }),
      ],
      [],
      [line("VIE-001", 10)],
    );

    // 10 % de 20,00 € = 2,00 € ; puis 5 % des 18,00 € restants = 0,90 €.
    expect(replayed.discountCents).toBe(290);
    expect(replayed.discountAdjustment).toBeNull();
    expect(replayed.basketDiscounts?.map((step) => step.promotionId)).toEqual([
      "promo_a",
      "promo_b",
    ]);
    expect(replayed.basketDiscounts?.[0]?.terms?.cumulative).toBe(true);
  });

  it("des remises cumulées dont l'une perd tous ses SKU redeviennent la remise unique", () => {
    const replayed = replayBasketDiscounts(
      [
        discount({ promotionId: "promo_a", coveredSkus: ["VIE-001"] }),
        discount({ orderDiscountId: "od_2", promotionId: "promo_b", coveredSkus: ["PAI-001"] }),
      ],
      [],
      [line("VIE-001", 10)],
    );

    expect(replayed.basketDiscounts).toBeUndefined();
    expect(replayed.discountPromotionId).toBe("promo_a");
  });

  it("une remise reprise sans ajustement garde son montant figé, borné à l'assiette restante", () => {
    const frozen = discount({ promotionId: null, adjustment: null, amountCents: 500, terms: null });

    expect(replayBasketDiscounts([frozen], [], [line("VIE-001", 10)]).discountCents).toBe(500);
    // Plus que 2,00 € d'assiette : la remise ne la dépasse pas.
    expect(replayBasketDiscounts([frozen], [], [line("VIE-001", 1)]).discountCents).toBe(200);
  });

  it("une remise lue dans les colonnes couvre les lignes éligibles de la commande", () => {
    const previous: readonly OrderLineSnapshot[] = [
      snapshot("VIE-001", true),
      snapshot("PAI-001", false),
    ];
    const columns = discount({ orderDiscountId: null, coveredSkus: null });

    const replayed = replayBasketDiscounts([columns], previous, [
      line("VIE-001", 10),
      line("PAI-001", 10),
    ]);

    expect([...replayed.ineligibleSkus]).toEqual(["PAI-001"]);
    expect(replayed.discountCents).toBe(200);
  });
});

describe("replayableDiscountsOf", () => {
  const columns = {
    discountPromotionId: "promo_a",
    discountAdjustment: TEN_PERCENT,
    discountLabel: LABEL,
    discountCents: 200,
    discountTtcCents: null,
  };

  it("la table fait foi dès qu'elle a des remises actives", () => {
    const active = [discount()];

    expect(replayableDiscountsOf({ ...columns, activeDiscounts: active })).toBe(active);
  });

  it("sinon, les colonnes comme une remise de rang 1, sans termes connus", () => {
    expect(replayableDiscountsOf({ ...columns, activeDiscounts: [] })).toEqual([
      expect.objectContaining({
        orderDiscountId: null,
        promotionId: "promo_a",
        coveredSkus: null,
        amountCents: 200,
        terms: null,
      }),
    ]);
  });

  it("une remise figée sans ajustement est gardée à son montant, pas oubliée", () => {
    const frozen = { ...columns, discountAdjustment: null, activeDiscounts: [] };

    expect(replayableDiscountsOf(frozen)).toHaveLength(1);
  });

  it("aucune remise : rien à rejouer", () => {
    const none = { ...columns, discountAdjustment: null, discountCents: 0, activeDiscounts: [] };

    expect(replayableDiscountsOf(none)).toEqual([]);
  });
});

function snapshot(sku: string, eligible: boolean): OrderLineSnapshot {
  return {
    sku,
    productName: sku,
    unitPriceMillicents: 200_000,
    vatRate: 5.5,
    saleUnit: "piece",
    quantity: 10,
    lineTotalCents: 2_000,
    unitPriceTtcCents: null,
    lineTotalTtcCents: null,
    pricing: null,
    allergens: null,
    pickupDiscountEligible: eligible,
    productId: null,
    categoryId: null,
    madeToOrder: null,
  };
}
