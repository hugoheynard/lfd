import type { AudiencePickupDiscount } from "@lfd/contracts";

import { admittedPromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { AdmittedPromotion } from "../../../../promotions/domain/live-promotion.js";
import type { OrderLineClassification } from "../../ports/order-line-classification.reader.js";
import { repriseScopeOf } from "../../../../promotions/domain/__tests__/pickup-discount-reprise.fixture.js";
import {
  chooseBasketPromotion,
  NO_BASKET_PROMOTION,
  outcomeOf,
} from "../basket-promotion-choice.js";

/**
 * Le point panier (plan des promotions, § 13.2 et § 13.11, lot L5) : une
 * remise de retrait reprise en promotion rend le MÊME montant, la même
 * assiette et le même ajustement que la remise du site.
 *
 * RÉÉCRIT en L12 (2026-10-30) : l'ancien chemin (`ineligibleSkusOf`,
 * `pickupDiscountCentsOf`) est retiré du code. Les montants et assiettes
 * qu'il rendait sur ce panier sont désormais écrits en clair — les mêmes
 * valeurs, comparées au centime comme avant.
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

const LINES = [
  { sku: "PAI-001", htCents: 1_234, quantity: 3 },
  { sku: "PAI-002", htCents: 877, quantity: 1 },
  { sku: "BOI-001", htCents: 450, quantity: 2 },
];

/** La reprise d'une remise de retrait en promotion. */
function reprise(discount: AudiencePickupDiscount): AdmittedPromotion {
  return admittedPromotion({
    id: "pd_site_b2c",
    effect:
      discount.adjustment.mode === "percent"
        ? { kind: "percent_off", basisPoints: discount.adjustment.bp }
        : { kind: "basket_amount_off", cents: discount.adjustment.cents },
    audience: { kind: "everyone_but_active_pros" },
    fulfillment: { kind: "pickup_point", pickupId: "site" },
    scope: repriseScopeOf(discount),
  });
}

function discount(over: Partial<AudiencePickupDiscount>): AudiencePickupDiscount {
  return {
    adjustment: { mode: "percent", bp: 2000 },
    scope: "all_except",
    categories: [],
    products: [],
    ...over,
  };
}

describe("chooseBasketPromotion — la reprise d'une remise de retrait", () => {
  // Ce que l'ancien chemin rendait sur `LINES` (assiette 2 561 c en tout).
  it.each<[string, AudiencePickupDiscount, number, readonly string[]]>([
    ["20 % sur tout", discount({}), 512, []],
    // Le cas réel de production : tout sauf UNE exception.
    [
      "20 % tout sauf un produit",
      discount({ products: [{ productId: "p_jus", eligible: false }] }),
      422,
      ["BOI-001"],
    ],
    [
      "tout sauf une famille, produit réinclus",
      discount({
        categories: [{ categoryId: "c_pains", eligible: false }],
        products: [{ productId: "p_seigle", eligible: true }],
      }),
      265,
      ["PAI-001"],
    ],
    [
      "seulement une famille",
      discount({ scope: "only", categories: [{ categoryId: "c_boissons", eligible: true }] }),
      90,
      ["PAI-001", "PAI-002"],
    ],
    [
      "montant fixe supérieur à l'assiette",
      discount({ adjustment: { mode: "amount", cents: 99_999 } }),
      2_561,
      [],
    ],
  ])("%s : même montant, même assiette, même ajustement", (_label, source, cents, ineligible) => {
    const chosen = chooseBasketPromotion([reprise(source)], LINES, CLASSES);

    expect(chosen.discountCents).toBe(cents);
    expect([...chosen.ineligibleSkus].sort()).toEqual([...ineligible]);
    expect(chosen.discountAdjustment).toEqual(source.adjustment);
    expect(chosen.promotionId).toBe("pd_site_b2c");
  });

  it("rend l'absence de promotion sans candidate", () => {
    expect(chooseBasketPromotion([], LINES, CLASSES)).toEqual(NO_BASKET_PROMOTION);
  });

  it("préfère le public le plus spécifique, puis la plus avantageuse, puis le plus petit id", () => {
    const everyone = admittedPromotion({
      id: "a",
      audience: { kind: "everyone" },
      fulfillment: { kind: "pickup" },
      effect: { kind: "percent_off", basisPoints: 5000 },
    });
    const pros = admittedPromotion({
      id: "b",
      audience: { kind: "pros_active" },
      fulfillment: { kind: "pickup" },
    });
    expect(chooseBasketPromotion([everyone, pros], LINES, CLASSES).promotionId).toBe("b");

    const twinLow = admittedPromotion({ id: "c", fulfillment: { kind: "pickup" } });
    const twinHigh = admittedPromotion({
      id: "d",
      fulfillment: { kind: "pickup" },
      effect: { kind: "percent_off", basisPoints: 3000 },
    });
    expect(chooseBasketPromotion([twinLow, twinHigh], LINES, CLASSES).promotionId).toBe("d");
    const twinSame = admittedPromotion({ id: "0", fulfillment: { kind: "pickup" } });
    expect(chooseBasketPromotion([twinLow, twinSame], LINES, CLASSES).promotionId).toBe("0");
  });

  it("retire de l'assiette une ligne sous le seuil de quantité", () => {
    const promotion = admittedPromotion({
      fulfillment: { kind: "pickup" },
      conditions: [{ kind: "min_quantity", value: 2 }],
    });
    const chosen = chooseBasketPromotion([promotion], LINES, CLASSES);
    expect([...chosen.ineligibleSkus]).toEqual(["PAI-002"]);
  });
});

/** Une cible « seulement cette famille », pour fabriquer une portée qui ne touche pas tout. */
const ONLY_BOISSONS = {
  mode: "only",
  rules: [{ target: "category", targetId: "c_boissons", eligible: true, targetRank: null }],
} as const;

/** Assiette de `LINES` : 3 702 − 1 141 = 2 561 c ; ici les seules boissons : 450 c. */
describe("chooseBasketPromotion — l'ordre du choix", () => {
  // Le point précis bat « le retrait », même quand ce dernier remise bien plus :
  // la spécificité de l'acheminement passe avant l'avantage.
  it("l'acheminement le plus précis l'emporte sur une remise plus forte", () => {
    const mode = admittedPromotion({
      id: "a_mode",
      fulfillment: { kind: "pickup" },
      effect: { kind: "percent_off", basisPoints: 5000 },
    });
    const point = admittedPromotion({
      id: "z_point",
      fulfillment: { kind: "pickup_point", pickupId: "site" },
      effect: { kind: "percent_off", basisPoints: 500 },
    });

    const chosen = chooseBasketPromotion([mode, point], LINES, CLASSES);

    expect(chosen.promotionId).toBe("z_point");
    expect(chosen.discountCents).toBe(128);
  });

  // Le public prime sur l'acheminement : une société nommée au retrait générique
  // bat « tout le monde » au point précis.
  it("le public passe avant l'acheminement", () => {
    const company = admittedPromotion({
      id: "b_company",
      audience: { kind: "company", companyId: "co_1" },
      fulfillment: { kind: "pickup" },
    });
    const everyoneAtPoint = admittedPromotion({
      id: "a_point",
      fulfillment: { kind: "pickup_point", pickupId: "site" },
    });

    expect(chooseBasketPromotion([everyoneAtPoint, company], LINES, CLASSES).promotionId).toBe(
      "b_company",
    );
  });

  it("à rang égal, un montant fixe qui remise plus qu'un pourcentage l'emporte — et inversement", () => {
    const percent = admittedPromotion({
      id: "b_pct",
      fulfillment: { kind: "pickup" },
      effect: { kind: "percent_off", basisPoints: 1000 },
    });
    const bigAmount = admittedPromotion({
      id: "z_amount",
      fulfillment: { kind: "pickup" },
      effect: { kind: "basket_amount_off", cents: 300 },
    });
    const smallAmount = admittedPromotion({
      id: "a_amount",
      fulfillment: { kind: "pickup" },
      effect: { kind: "basket_amount_off", cents: 100 },
    });

    // 10 % de 2 561 c = 256 c.
    expect(chooseBasketPromotion([percent, bigAmount], LINES, CLASSES).promotionId).toBe(
      "z_amount",
    );
    expect(chooseBasketPromotion([percent, smallAmount], LINES, CLASSES).promotionId).toBe("b_pct");
  });

  // Deux montants fixes supérieurs au panier remisent tous deux l'assiette
  // entière : à montant rendu égal, c'est l'id qui tranche, pas le nominal.
  it("compare les montants BORNÉS à l'assiette, pas les nominaux", () => {
    const huge = admittedPromotion({
      id: "z_huge",
      fulfillment: { kind: "pickup" },
      effect: { kind: "basket_amount_off", cents: 900_000 },
    });
    const big = admittedPromotion({
      id: "a_big",
      fulfillment: { kind: "pickup" },
      effect: { kind: "basket_amount_off", cents: 99_999 },
    });

    const chosen = chooseBasketPromotion([huge, big], LINES, CLASSES);

    expect(chosen.promotionId).toBe("a_big");
    expect(chosen.discountCents).toBe(2_561);
  });

  it("rend le même choix quel que soit l'ordre des candidates", () => {
    const twins = ["m", "c", "x", "a"].map((id) =>
      admittedPromotion({ id, fulfillment: { kind: "pickup" } }),
    );

    const forward = chooseBasketPromotion(twins, LINES, CLASSES).promotionId;
    const backward = chooseBasketPromotion([...twins].reverse(), LINES, CLASSES).promotionId;

    expect(forward).toBe("a");
    expect(backward).toBe("a");
  });

  it("un effet de ligne n'est pas une remise de panier : rien n'est retiré", () => {
    const line = admittedPromotion({
      fulfillment: { kind: "pickup" },
      effect: { kind: "unit_amount_off", millicents: 5_000 },
    });

    const chosen = chooseBasketPromotion([line], LINES, CLASSES);

    expect(chosen.discountCents).toBe(0);
    expect(chosen.discountAdjustment).toBeNull();
  });

  // Le libellé figé est celui de la gagnante, pas d'une perdante.
  it("rend le libellé servi de la promotion retenue", () => {
    const winner = admittedPromotion({
      id: "w",
      label: "Offre gagnante",
      fulfillment: { kind: "pickup" },
      effect: { kind: "percent_off", basisPoints: 3000 },
    });
    const loser = admittedPromotion({
      id: "l",
      label: "Offre perdante",
      fulfillment: { kind: "pickup" },
    });

    expect(chooseBasketPromotion([loser, winner], LINES, CLASSES).label?.fr).toBe("Offre gagnante");
  });
});

describe("chooseBasketPromotion — assiette et arrondi", () => {
  const pickup = (basisPoints: number) =>
    admittedPromotion({
      fulfillment: { kind: "pickup" },
      effect: { kind: "percent_off", basisPoints },
    });

  // 10 % de 1 005 c = 100,5 c : la moitié monte. 1 004 c → 100,4 → 100.
  it.each<[number, number]>([
    [1_005, 101],
    [1_004, 100],
    [5, 1],
    [4, 0],
    [0, 0],
  ])("10 %% de %i c rend %i c (arrondi au plus proche, moitié vers le haut)", (ht, expected) => {
    const chosen = chooseBasketPromotion(
      [pickup(1_000)],
      [{ sku: "PAI-001", htCents: ht, quantity: 1 }],
      CLASSES,
    );

    expect(chosen.discountCents).toBe(expected);
  });

  // L'arrondi se prend UNE fois, sur la somme : deux lignes à 5 c remises à
  // 10 % valent 1 c, pas 2 c (0,5 arrondi deux fois).
  it("arrondit une fois sur l'assiette totale, pas ligne par ligne", () => {
    const chosen = chooseBasketPromotion(
      [pickup(1_000)],
      [
        { sku: "PAI-001", htCents: 5, quantity: 1 },
        { sku: "PAI-002", htCents: 5, quantity: 1 },
      ],
      CLASSES,
    );

    expect(chosen.discountCents).toBe(1);
  });

  it("100 % remise exactement l'assiette, jamais au-delà", () => {
    const chosen = chooseBasketPromotion([pickup(10_000)], LINES, CLASSES);

    expect(chosen.discountCents).toBe(2_561);
  });

  it("un montant fixe sous l'assiette est rendu tel quel, sans arrondi", () => {
    const fixed = admittedPromotion({
      fulfillment: { kind: "pickup" },
      effect: { kind: "basket_amount_off", cents: 250 },
    });

    expect(chooseBasketPromotion([fixed], LINES, CLASSES).discountCents).toBe(250);
  });

  it("un montant fixe sur un panier de 0 c ne remise rien (jamais négatif)", () => {
    const fixed = admittedPromotion({
      fulfillment: { kind: "pickup" },
      effect: { kind: "basket_amount_off", cents: 250 },
    });

    const chosen = chooseBasketPromotion(
      [fixed],
      [{ sku: "PAI-001", htCents: 0, quantity: 1 }],
      CLASSES,
    );

    expect(chosen.discountCents).toBe(0);
  });

  it("l'assiette d'une portée « seulement » est celle des seules lignes couvertes", () => {
    const boissons = admittedPromotion({
      fulfillment: { kind: "pickup" },
      scope: ONLY_BOISSONS,
      effect: { kind: "percent_off", basisPoints: 1000 },
    });

    const chosen = chooseBasketPromotion([boissons], LINES, CLASSES);

    expect(chosen.discountCents).toBe(45);
    expect([...chosen.ineligibleSkus].sort()).toEqual(["PAI-001", "PAI-002"]);
  });

  // Un sku que le catalogue ne connaît pas (rangement absent) n'a ni produit ni
  // famille : une portée « seulement » ne le couvre pas, « tout sauf » oui.
  it("une ligne au rangement inconnu n'est couverte que par « tout sauf »", () => {
    const unknown = [{ sku: "XXX-999", htCents: 1_000, quantity: 1 }];
    const only = admittedPromotion({ fulfillment: { kind: "pickup" }, scope: ONLY_BOISSONS });
    const allExcept = admittedPromotion({ fulfillment: { kind: "pickup" } });

    expect(chooseBasketPromotion([only], unknown, CLASSES).discountCents).toBe(0);
    expect(chooseBasketPromotion([allExcept], unknown, CLASSES).discountCents).toBe(200);
  });
});

describe("chooseBasketPromotion — la condition de quantité minimum", () => {
  const withMin = (value: number) =>
    admittedPromotion({
      fulfillment: { kind: "pickup" },
      conditions: [{ kind: "min_quantity", value }],
    });

  // LINES : quantités 3, 1, 2. Le seuil est INCLUS : 2 laisse passer la ligne à 2.
  it.each<[number, readonly string[], number]>([
    [1, [], 512],
    [2, ["PAI-002"], 337],
    [3, ["BOI-001", "PAI-002"], 247],
    [4, ["BOI-001", "PAI-001", "PAI-002"], 0],
  ])("seuil %i : lignes écartées %j, remise %i c", (value, ineligible, cents) => {
    const outcome = outcomeOf(withMin(value), LINES, CLASSES);

    expect([...outcome.ineligibleSkus].sort()).toEqual([...ineligible]);
    expect(outcome.discountCents).toBe(cents);
  });

  it("un seuil qu'aucune ligne n'atteint ne fige aucune promotion", () => {
    expect(chooseBasketPromotion([withMin(4)], LINES, CLASSES)).toEqual(NO_BASKET_PROMOTION);
  });

  it("le seuil s'applique à chaque ligne, jamais à la quantité totale du panier", () => {
    // Trois lignes d'une pièce : 3 pièces en tout, mais aucune n'atteint 2.
    const singles = ["PAI-001", "PAI-002", "BOI-001"].map((sku) => ({
      sku,
      htCents: 100,
      quantity: 1,
    }));

    expect(chooseBasketPromotion([withMin(2)], singles, CLASSES).discountCents).toBe(0);
  });
});

describe("chooseBasketPromotion — une promotion qui ne touche aucune ligne", () => {
  /**
   * Régression : une promotion plus spécifique mais qui ne touchait aucune
   * ligne gagnait sur son rang de public et figeait une remise de 0 c,
   * privant l'acheteur des 20 % (fix 2026-10-30).
   */
  it("ne prive pas l'acheteur d'une remise réelle", () => {
    const everyone = admittedPromotion({
      id: "everyone_20",
      fulfillment: { kind: "pickup" },
    });
    const prosOnBoissons = admittedPromotion({
      id: "pros_boissons",
      audience: { kind: "pros_active" },
      fulfillment: { kind: "pickup" },
      scope: ONLY_BOISSONS,
    });
    const breadOnly = [{ sku: "PAI-001", htCents: 1_000, quantity: 1 }];

    const chosen = chooseBasketPromotion([everyone, prosOnBoissons], breadOnly, CLASSES);

    expect(chosen.promotionId).toBe("everyone_20");
    expect(chosen.discountCents).toBe(200);
  });
});
