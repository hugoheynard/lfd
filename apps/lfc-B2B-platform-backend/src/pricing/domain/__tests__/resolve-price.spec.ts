import type { PriceFloor, PriceRule, PricingContext } from "../price-rule.js";
import {
  AmbiguousPriceRulesError,
  InvalidAlterationError,
  InvalidCanonicalPriceError,
} from "../pricing-errors.js";
import { resolvePrice } from "../resolve-price.js";

/**
 * La fonction pure du chantier prix, éprouvée **par énumération** : aucun Nest,
 * aucune base, aucune horloge. Chaque bloc correspond à une décision écrite dans
 * `architecture-resolution-de-prix.md` — si l'un tombe, c'est le doc qui ment.
 */

const AT = new Date("2026-08-17T10:00:00.000Z");
const HIER = new Date("2026-08-16T00:00:00.000Z");

function context(over: Partial<PricingContext> = {}): PricingContext {
  return {
    at: AT,
    quantity: 1,
    variantSku: "VIE-001-1",
    productSku: "VIE-001",
    categoryId: "cat_vien",
    companyId: "cmp_dupont",
    segmentId: "seg_boulangerie",
    ...over,
  };
}

/** Une remise en pourcentage, par défaut globale et pour tous. */
function percentOff(over: Partial<PriceRule> & { bp: number }): PriceRule {
  const { bp, ...rest } = over;
  return {
    id: "rule",
    stage: "promotion",
    scope: { type: "global", id: null },
    audience: { type: "all", id: null },
    minQuantity: null,
    validFrom: HIER,
    validTo: null,
    suspendedFrom: null,
    label: `−${String(bp / 100)} %`,
    nature: "alter",
    alteration: { direction: "decrease", mode: "percent", bp },
    ...rest,
  } as PriceRule;
}

/** Une mercuriale : un prix posé, pas une remise. */
function mercuriale(amountCents: number, over: Partial<PriceRule> = {}): PriceRule {
  return {
    id: "merc",
    stage: "mercuriale",
    scope: { type: "global", id: null },
    audience: { type: "company", id: "cmp_dupont" },
    minQuantity: null,
    validFrom: HIER,
    validTo: null,
    suspendedFrom: null,
    label: "Mercuriale Dupont",
    nature: "replace",
    amountCents,
    ...over,
  } as PriceRule;
}

describe("resolvePrice — sans règle", () => {
  it("rend le prix canonique et une trace vide", () => {
    const result = resolvePrice(240, [], context());

    expect(result.finalCents).toBe(240);
    expect(result.basePriceCents).toBe(240);
    expect(result.steps).toEqual([]);
    expect(result.floored).toBe(false);
  });

  it("refuse un prix canonique négatif — une dette n'est pas une ligne de commande", () => {
    expect(() => resolvePrice(-100, [], context())).toThrow(InvalidCanonicalPriceError);
  });

  /**
   * Zéro **passe**. Un article offert est un cas réel, et le refuser cassait le
   * chemin d'une commande sans rien à encaisser — constaté en branchant S2.
   */
  it("accepte un article à zéro, et les altérations le laissent à zéro", () => {
    const result = resolvePrice(0, [percentOff({ id: "p", bp: 1000 })], context());

    expect(result.finalCents).toBe(0);
  });
});

describe("resolvePrice — la composition (fork 2)", () => {
  /**
   * LE test de la décision : −20 % puis −10 % font −28 %, pas −30 %. Chaque
   * étage s'applique au prix sortant du précédent.
   */
  it("compose deux pourcentages au lieu de les additionner", () => {
    const result = resolvePrice(
      1000,
      [
        percentOff({ id: "vol", stage: "volume", bp: 2000 }),
        percentOff({ id: "promo", stage: "promotion", bp: 1000 }),
      ],
      context(),
    );

    expect(result.finalCents).toBe(720); // 1000 × 0,8 × 0,9 — et non 700
  });

  it("applique les étages dans l'ordre déclaré, pas dans celui des règles", () => {
    // −5 € puis −20 % ≠ −20 % puis −5 €. L'ordre est commercial, pas technique.
    const result = resolvePrice(
      1000,
      [
        percentOff({ id: "geste", stage: "geste", bp: 2000 }),
        {
          ...percentOff({ id: "vol", stage: "volume", bp: 1 }),
          alteration: { direction: "decrease", mode: "amount", cents: 500 },
          label: "−5 €",
        } as PriceRule,
      ],
      context(),
    );

    // volume (−5 €) d'abord → 500, puis geste (−20 %) → 400.
    expect(result.finalCents).toBe(400);
    expect(result.steps.map((step) => step.stage)).toEqual(["volume", "geste"]);
  });

  it("un étage sans gagnante est transparent", () => {
    const result = resolvePrice(240, [percentOff({ id: "p", bp: 1000 })], context());

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.stage).toBe("promotion");
  });
});

describe("resolvePrice — l'arrondi unique", () => {
  /**
   * Le cas qui **discrimine** les deux méthodes, et la raison d'être du
   * rationnel : 5,01 € remisé deux fois de moitié vaut 1,2525 € — donc 1,25 €.
   * En arrondissant à chaque étage on obtiendrait 1,26 €, un centime de trop,
   * facturé sur chaque ligne concernée.
   *
   * Un test qui ne distinguerait pas les deux (beaucoup de valeurs donnent le
   * même résultat des deux façons) n'aurait prouvé que sa propre existence.
   */
  it("n'arrondit qu'en fin de chaîne — 1,25 € et non 1,26 €", () => {
    const result = resolvePrice(
      501,
      [
        percentOff({ id: "a", stage: "volume", bp: 5000 }),
        percentOff({ id: "b", stage: "promotion", bp: 5000 }),
      ],
      context(),
    );

    expect(result.finalCents).toBe(125);
    // La trace affiche l'étage arrondi (251), mais la chaîne a poursuivi
    // avec 250,5 — c'est toute la différence.
    expect(result.steps[0]?.resultCents).toBe(251);
  });

  it("arrondit la moitié en s'éloignant de zéro, pas au pair", () => {
    // 5 × 0,5 = 2,5 → 3. L'arrondi IEEE rendrait 2.
    const result = resolvePrice(5, [percentOff({ id: "p", bp: 5000 })], context());

    expect(result.finalCents).toBe(3);
  });

  /** Sans `bigint`, trois pourcentages sur un article cher perdraient la précision. */
  it("reste exact sur un article à 1 000 € et trois étages", () => {
    const result = resolvePrice(
      100_000,
      [
        percentOff({ id: "a", stage: "volume", bp: 1 }),
        percentOff({ id: "b", stage: "promotion", bp: 1 }),
        percentOff({ id: "c", stage: "geste", bp: 1 }),
      ],
      context(),
    );

    // 100000 × 0,9999³ = 99970,003 → 99970.
    expect(result.finalCents).toBe(99_970);
  });
});

describe("resolvePrice — replace contre alter", () => {
  it("une mercuriale POSE un prix, elle ne remise pas", () => {
    const result = resolvePrice(240, [mercuriale(210)], context());

    expect(result.finalCents).toBe(210);
  });

  it("l'exemple du doc, de bout en bout", () => {
    // Base 2,40 € → mercuriale Dupont 2,10 € → palier 100+ −5 % → 2,00 €.
    const result = resolvePrice(
      240,
      [mercuriale(210), percentOff({ id: "vol", stage: "volume", bp: 500, minQuantity: 100 })],
      context({ quantity: 100 }),
    );

    expect(result.finalCents).toBe(200);
    expect(result.steps.map((step) => step.resultCents)).toEqual([210, 200]);
  });

  it("refuse une grandeur d'altération négative — le sens vit dans `direction`", () => {
    const wrong = percentOff({ id: "p", bp: -2000 });

    expect(() => resolvePrice(240, [wrong], context())).toThrow(InvalidAlterationError);
  });
});

describe("resolvePrice — le plancher (fork 3)", () => {
  const floorPercent: PriceFloor = { mode: "percent", bp: 5000 };
  const floorAmount: PriceFloor = { mode: "amount", cents: 150 };

  it("relève le prix sous une fraction du canonique, et le CONSIGNE", () => {
    const result = resolvePrice(1000, [percentOff({ id: "p", bp: 9000 })], context(), floorPercent);

    expect(result.finalCents).toBe(500);
    expect(result.floored).toBe(true);
  });

  it("relève le prix sous un montant plancher", () => {
    const result = resolvePrice(1000, [percentOff({ id: "p", bp: 9000 })], context(), floorAmount);

    expect(result.finalCents).toBe(150);
    expect(result.floored).toBe(true);
  });

  it("ne consigne rien quand le plancher n'a pas servi", () => {
    const result = resolvePrice(1000, [percentOff({ id: "p", bp: 1000 })], context(), floorPercent);

    expect(result.finalCents).toBe(900);
    expect(result.floored).toBe(false);
  });

  /**
   * Le plancher se calcule sur le **canonique**, pas sur le prix courant : un
   * plancher qui suivrait le prix altéré descendrait avec lui et ne
   * planchérerait rien.
   */
  it("se mesure au prix canonique, pas au prix en cours de chaîne", () => {
    const result = resolvePrice(
      1000,
      [
        percentOff({ id: "a", stage: "volume", bp: 5000 }),
        percentOff({ id: "b", stage: "promotion", bp: 5000 }),
      ],
      context(),
      floorPercent,
    );

    // 1000 → 500 → 250, sous les 500 du plancher.
    expect(result.finalCents).toBe(500);
    expect(result.floored).toBe(true);
  });

  it("la trace garde les étages même quand le plancher a repris la main", () => {
    const result = resolvePrice(1000, [percentOff({ id: "p", bp: 9000 })], context(), floorPercent);

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.resultCents).toBe(100);
    expect(result.finalCents).toBe(500);
  });
});

describe("resolvePrice — l'ambiguïté", () => {
  it("refuse deux règles également spécifiques dans un même étage", () => {
    const first = percentOff({ id: "a", bp: 1000 });
    const second = percentOff({ id: "b", bp: 2000 });

    expect(() => resolvePrice(240, [first, second], context())).toThrow(AmbiguousPriceRulesError);
  });

  it("n'est PAS ambigu si les deux règles sont dans des étages différents", () => {
    const result = resolvePrice(
      1000,
      [
        percentOff({ id: "a", stage: "volume", bp: 1000 }),
        percentOff({ id: "b", stage: "promotion", bp: 1000 }),
      ],
      context(),
    );

    expect(result.finalCents).toBe(810);
  });
});
