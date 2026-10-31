import { admittedPromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { AdmittedPromotion } from "../../../../promotions/domain/live-promotion.js";
import type { PromotionEffect } from "../../../../promotions/domain/promotion-effect.js";
import type { OrderLineClassification } from "../../ports/order-line-classification.reader.js";
import {
  chooseBasketPromotion,
  MULTIPLE_BASKET_DISCOUNTS_LABEL,
} from "../basket-promotion-choice.js";
import { cumulatedDiscountsOf } from "../basket-promotion-plan.js";

/**
 * Le cumul au point PANIER (plan des promotions, § 16.1 étapes 1 et 2,
 * § 18.6, lot M7) : la meilleure non cumulable par article comme hier, plus
 * les cumulables enchaînées ; le plan le plus fort l'emporte, à égalité le
 * non cumulable ; une étape ramenée à zéro ne concourt pas.
 */

const CLASSES: ReadonlyMap<string, OrderLineClassification> = new Map([
  [
    "PAI-001",
    { productId: "p_pain", categoryId: "c_pains", categoryPath: ["c_pains"], madeToOrder: false },
  ],
  [
    "PAI-002",
    { productId: "p_seigle", categoryId: "c_pains", categoryPath: ["c_pains"], madeToOrder: false },
  ],
  [
    "BOI-001",
    {
      productId: "p_jus",
      categoryId: "c_boissons",
      categoryPath: ["c_boissons"],
      madeToOrder: false,
    },
  ],
]);

/** Assiette totale : 2 561 c HT. */
const LINES = [
  { sku: "PAI-001", htCents: 1_234, quantity: 3 },
  { sku: "PAI-002", htCents: 877, quantity: 1 },
  { sku: "BOI-001", htCents: 450, quantity: 2 },
];

function basket(
  id: string,
  effect: PromotionEffect,
  options: { readonly cumulative?: boolean; readonly onlyProduct?: string } = {},
): AdmittedPromotion {
  return admittedPromotion({
    id,
    label: `Promo ${id}`,
    effect,
    cumulative: options.cumulative ?? false,
    fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
    scope:
      options.onlyProduct === undefined
        ? { mode: "all_except", rules: [] }
        : {
            mode: "only",
            rules: [
              {
                target: "product",
                targetId: options.onlyProduct,
                eligible: true,
                targetRank: null,
              },
            ],
          },
  });
}

const percent = (basisPoints: number): PromotionEffect => ({ kind: "percent_off", basisPoints });

describe("chooseBasketPromotion — le cumul au panier (M7)", () => {
  it("enchaîne deux cumulables : 10 % puis 5 % du reste, un arrondi par étape", () => {
    const chosen = chooseBasketPromotion(
      [
        basket("b", percent(500), { cumulative: true }),
        basket("a", percent(1_000), { cumulative: true }),
      ],
      LINES,
      CLASSES,
    );

    // 10 % de 2 561 = 256 ; 5 % des 2 305 restants = 115,25 → 115.
    expect(chosen.applied.map((step) => [step.promotionId, step.discountCents])).toEqual([
      ["a", 256],
      ["b", 115],
    ]);
    expect(chosen.discountCents).toBe(371);
    // Arbitrage n° 1 (§ 18.8) : plus de remise unique dans les colonnes.
    expect(chosen.discountAdjustment).toBeNull();
    expect(chosen.promotionId).toBeNull();
    expect(chosen.label).toEqual(MULTIPLE_BASKET_DISCOUNTS_LABEL);
    expect(chosen.ineligibleSkus.size).toBe(0);
  });

  it("une cumulable sur un seul article s'applique à son reste, et les autres restent éligibles", () => {
    const chosen = chooseBasketPromotion(
      [
        basket("a", percent(1_000), { cumulative: true }),
        basket("b", percent(5_000), { cumulative: true, onlyProduct: "p_jus" }),
      ],
      LINES,
      CLASSES,
    );

    // Le jus restait à 450 × 2 305 / 2 561 = 405,02 c : 50 % = 202,5… → 203.
    expect(chosen.applied.map((step) => step.discountCents)).toEqual([256, 203]);
    expect([...(chosen.applied[1]?.ineligibleSkus ?? [])].sort()).toEqual(["PAI-001", "PAI-002"]);
    expect(chosen.ineligibleSkus.size).toBe(0);
  });

  it("une seule cumulable rend la remise unique d'hier, champ pour champ", () => {
    const alone = basket("a", percent(2_000), { cumulative: true });
    const asExclusive = basket("a", percent(2_000));

    const cumulated = chooseBasketPromotion([alone], LINES, CLASSES);
    const exclusive = chooseBasketPromotion([asExclusive], LINES, CLASSES);

    expect(cumulated).toEqual(exclusive);
    expect(cumulated.discountCents).toBe(512);
    expect(cumulated.promotionId).toBe("a");
  });

  it("la non cumulable l'emporte quand elle retire plus que la chaîne", () => {
    const chosen = chooseBasketPromotion(
      [
        basket("nc", percent(2_000)),
        basket("a", percent(1_000), { cumulative: true }),
        basket("b", percent(500), { cumulative: true }),
      ],
      LINES,
      CLASSES,
    );

    expect(chosen.promotionId).toBe("nc");
    expect(chosen.discountCents).toBe(512);
    expect(chosen.applied).toHaveLength(1);
  });

  it("la chaîne l'emporte quand elle retire plus que la non cumulable", () => {
    const chosen = chooseBasketPromotion(
      [
        basket("nc", percent(500)),
        basket("a", percent(1_000), { cumulative: true }),
        basket("b", percent(500), { cumulative: true }),
      ],
      LINES,
      CLASSES,
    );

    expect(chosen.applied.map((step) => step.promotionId)).toEqual(["a", "b"]);
    expect(chosen.discountCents).toBe(371);
  });

  it("à égalité, le plan non cumulable", () => {
    // 10 % puis 5 % = 371 c ; un montant fixe de 371 c fait jeu égal.
    const chosen = chooseBasketPromotion(
      [
        basket("nc", { kind: "basket_amount_off", cents: 371 }),
        basket("a", percent(1_000), { cumulative: true }),
        basket("b", percent(500), { cumulative: true }),
      ],
      LINES,
      CLASSES,
    );

    expect(chosen.promotionId).toBe("nc");
  });

  it("une cumulable que la chaîne ramène à zéro ne concourt pas (assiette épuisée)", () => {
    const chosen = chooseBasketPromotion(
      [
        basket("a", { kind: "basket_amount_off", cents: 99_999 }, { cumulative: true }),
        basket("b", percent(1_000), { cumulative: true }),
      ],
      LINES,
      CLASSES,
    );

    expect(chosen.applied.map((step) => step.promotionId)).toEqual(["a"]);
    expect(chosen.promotionId).toBe("a");
    expect(chosen.discountCents).toBe(2_561);
  });

  it("deux non cumulables sur des articles disjoints : une par article", () => {
    const chosen = chooseBasketPromotion(
      [
        basket("on_bread", percent(1_000), { onlyProduct: "p_pain" }),
        basket("on_juice", percent(1_000), { onlyProduct: "p_jus" }),
      ],
      LINES,
      CLASSES,
    );

    expect(chosen.applied.map((step) => step.promotionId).sort()).toEqual(["on_bread", "on_juice"]);
    expect([...chosen.ineligibleSkus]).toEqual(["PAI-002"]);
  });
});

describe("cumulatedDiscountsOf — la couverture se lit par SKU (condition de M7)", () => {
  it("couvre toutes les lignes d'un même SKU ensemble", () => {
    const chosen = chooseBasketPromotion(
      [
        basket("a", percent(1_000), { cumulative: true }),
        basket("b", percent(500), { cumulative: true, onlyProduct: "p_pain" }),
      ],
      LINES,
      CLASSES,
    );
    const lines = [{ sku: "PAI-001" }, { sku: "BOI-001" }, { sku: "PAI-001" }];

    const cumulated = cumulatedDiscountsOf(lines, chosen.applied);

    expect(cumulated?.map((discount) => discount.coveredLines)).toEqual([
      [0, 1, 2],
      [0, 2],
    ]);
  });

  it("rend `undefined` pour une remise au plus — le chemin d'hier", () => {
    const chosen = chooseBasketPromotion([basket("a", percent(1_000))], LINES, CLASSES);

    expect(cumulatedDiscountsOf(LINES, chosen.applied)).toBeUndefined();
    expect(cumulatedDiscountsOf(LINES, [])).toBeUndefined();
  });
});

describe("chooseBasketPromotion — plafond et unité de comparaison (M7, 2026-10-31)", () => {
  it("au-delà de cinq cumulables, garde les cinq premières et nomme les autres, sans lever", () => {
    const six = ["a", "b", "c", "d", "e", "f"].map((id) =>
      basket(id, percent(100), { cumulative: true }),
    );

    const chosen = chooseBasketPromotion(six, LINES, CLASSES);

    expect(chosen.applied.map((step) => step.promotionId)).toEqual(["a", "b", "c", "d", "e"]);
    expect(chosen.beyondCap).toEqual(["f"]);
  });

  it("sans dépassement, pas de clé `beyondCap`", () => {
    const chosen = chooseBasketPromotion(
      [basket("a", percent(100), { cumulative: true })],
      LINES,
      CLASSES,
    );
    expect(chosen).not.toHaveProperty("beyondCap");
  });

  /**
   * Deux lignes de 10,00 € HT, l'une à 5,5 %, l'autre à 20 %. En HT, 1,00 €
   * fixe sur tout et 10 % de la ligne à 20 % font jeu égal (100 c) : le non
   * cumulable gagne. En TTC — ce que le particulier paie —, le fixe vaut
   * ~1,13 € et les 10 % 1,20 € : la chaîne gagne.
   */
  it("une commande exact_ht compare les plans en TTC, une commande line_ht en HT", () => {
    const lines = [
      { sku: "PAI-001", htCents: 1_000, quantity: 1 },
      { sku: "BOI-001", htCents: 1_000, quantity: 1 },
    ];
    const exactLines = [
      {
        ...lines[0],
        sku: "PAI-001",
        htCents: 1_000,
        quantity: 1,
        exact: { ttcCents: 1_055, vatRate: 5.5 },
      },
      {
        ...lines[1],
        sku: "BOI-001",
        htCents: 1_000,
        quantity: 1,
        exact: { ttcCents: 1_200, vatRate: 20 },
      },
    ];
    const candidates = [
      basket("nc", { kind: "basket_amount_off", cents: 100 }),
      basket("cu", percent(1_000), { cumulative: true, onlyProduct: "p_jus" }),
    ];

    expect(chooseBasketPromotion(candidates, lines, CLASSES).promotionId).toBe("nc");
    expect(chooseBasketPromotion(candidates, exactLines, CLASSES).promotionId).toBe("cu");
  });
});
