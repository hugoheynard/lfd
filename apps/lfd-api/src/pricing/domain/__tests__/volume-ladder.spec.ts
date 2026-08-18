import { VolumeLadderAggregate, type VolumeLadderDraft } from "../entities/volume-ladder.js";
import {
  AmbiguousVolumeTierError,
  EmptyVolumeLadderError,
  InvalidAlterationError,
  RegressiveVolumeLadderError,
  ReversedValidityWindowError,
} from "../pricing-errors.js";
import { ladderAsRule, tierFor } from "../volume-ladder.js";
import type { PricingContext } from "../price-rule.js";
import type { VolumeTier } from "../volume-ladder.js";

/**
 * **Le barème en un seul objet.**
 *
 * Ce fichier prouve surtout ce qui n'existait NULLE PART tant que les paliers
 * étaient des règles indépendantes : un barème qui régresse, un barème vide,
 * deux paliers à la même quantité. Chacune de ces règles, prise seule, est
 * valide — c'est l'échelle qui ne l'est pas.
 */

function draft(
  tiers: readonly VolumeTier[],
  over: Partial<VolumeLadderDraft> = {},
): VolumeLadderDraft {
  return {
    scope: { type: "product", id: "VIE-001" },
    audience: { type: "all", id: null },
    unit: "percent",
    tiers,
    label: "Barème viennoiserie",
    validFrom: new Date("2026-08-01T00:00:00.000Z"),
    validTo: null,
    ...over,
  };
}

const pose = (
  tiers: readonly VolumeTier[],
  over: Partial<VolumeLadderDraft> = {},
  id = "ladder_1",
) => VolumeLadderAggregate.pose(id, draft(tiers, over), "auth0|cecile");

function context(quantity: number): PricingContext {
  return {
    at: new Date("2026-08-17T10:00:00.000Z"),
    quantity,
    variantSku: "VIE-001-1",
    productSku: "VIE-001",
    categoryId: "viennoiserie",
    companyId: null,
    segmentId: null,
    cumulativeQuantity: null,
  };
}

describe("poser un barème", () => {
  it("trie les paliers, quel que soit l'ordre de saisie", () => {
    const ladder = pose([
      { minQuantity: 100, value: 1_000 },
      { minQuantity: 50, value: 500 },
    ]);

    expect(ladder.asLadder.tiers.map((tier) => tier.minQuantity)).toEqual([50, 100]);
  });

  /**
   * **Le refus qui justifie l'échelle.** « 50+ à −10 %, 100+ à −5 % » se compose
   * de deux règles parfaitement valides, et forme un barème que personne n'a
   * voulu : un client qui passe de 90 à 100 pièces verrait sa remise fondre.
   */
  it("refuse un barème où commander plus rapporte moins", () => {
    expect(() =>
      pose([
        { minQuantity: 50, value: 1_000 },
        { minQuantity: 100, value: 500 },
      ]),
    ).toThrow(RegressiveVolumeLadderError);
  });

  it("accepte deux paliers à la même remise — c'est un plateau, pas une régression", () => {
    expect(() =>
      pose([
        { minQuantity: 50, value: 500 },
        { minQuantity: 100, value: 500 },
      ]),
    ).not.toThrow();
  });

  /** À quantité égale, le gagnant dépendrait de l'ordre de saisie, donc du hasard. */
  it("refuse deux paliers à la même quantité", () => {
    expect(() =>
      pose([
        { minQuantity: 50, value: 500 },
        { minQuantity: 50, value: 800 },
      ]),
    ).toThrow(AmbiguousVolumeTierError);
  });

  it("refuse un palier à quantité nulle", () => {
    expect(() => pose([{ minQuantity: 0, value: 500 }])).toThrow(AmbiguousVolumeTierError);
  });

  it("refuse une remise nulle ou négative", () => {
    expect(() => pose([{ minQuantity: 50, value: 0 }])).toThrow(InvalidAlterationError);
  });

  it("refuse un barème sans palier", () => {
    expect(() => pose([])).toThrow(EmptyVolumeLadderError);
  });

  it("refuse une fenêtre qui se ferme avant de s'ouvrir", () => {
    expect(() =>
      pose([{ minQuantity: 50, value: 500 }], {
        validFrom: new Date("2026-08-10T00:00:00.000Z"),
        validTo: new Date("2026-08-01T00:00:00.000Z"),
      }),
    ).toThrow(ReversedValidityWindowError);
  });

  /**
   * « Un seul barème actif par cible » ne vit PAS dans l'agrégat : il ne voit
   * qu'une échelle à la fois, et deux écritures concurrentes lui échapperaient.
   * C'est une contrainte d'exclusion GiST qui le tient — l'e2e le prouve.
   */
  it("porte l'identifiant qu'on lui donne, sans le dériver de la cible", () => {
    expect(pose([{ minQuantity: 50, value: 500 }], {}, "ladder_x").id).toBe("ladder_x");
  });
});

describe("le palier qui s'applique", () => {
  const ladder = pose([
    { minQuantity: 50, value: 500 },
    { minQuantity: 100, value: 1_000 },
  ]).asLadder;

  it("n'accorde rien sous le premier palier", () => {
    expect(tierFor(ladder, 49)).toBeNull();
  });

  it("prend le palier atteint, à la pièce près", () => {
    expect(tierFor(ladder, 50)?.value).toBe(500);
  });

  /** Le PLUS HAUT palier atteint gagne : 150 pièces prennent le palier 100. */
  it("prend le plus haut palier atteint", () => {
    expect(tierFor(ladder, 150)?.minQuantity).toBe(100);
  });
});

describe("l'échelle vue comme une règle", () => {
  const ladder = pose([
    { minQuantity: 50, value: 500 },
    { minQuantity: 100, value: 1_000 },
  ]).asLadder;

  /**
   * C'est la pièce qui évite de toucher au pipeline : la résolution ne connaît
   * que des règles, et la spécificité continue d'arbitrer entre elles.
   */
  it("porte la fenêtre de l'échelle — c'est elle qui date le barème", () => {
    const rule = ladderAsRule(ladder, context(120));

    expect(rule?.validFrom).toEqual(new Date("2026-08-01T00:00:00.000Z"));
    expect(rule?.validTo).toBeNull();
  });

  it("rend une règle de l'étage volume, portant le palier atteint", () => {
    const rule = ladderAsRule(ladder, context(120));

    expect(rule?.stage).toBe("volume");
    expect(rule?.minQuantity).toBe(100);
    expect(rule?.nature).toBe("alter");
  });

  it("porte l'identifiant de l'ÉCHELLE — c'est lui que la trace gardera", () => {
    expect(ladderAsRule(ladder, context(120))?.id).toBe(ladder.id);
  });

  it("ne rend rien sous le premier palier : l'étage est transparent", () => {
    expect(ladderAsRule(ladder, context(10))).toBeNull();
  });

  it("traduit l'unité de l'échelle en unité d'altération", () => {
    const inEuros = pose([{ minQuantity: 50, value: 20 }], { unit: "amount" }).asLadder;
    const rule = ladderAsRule(inEuros, context(60));

    expect(rule?.nature === "alter" && rule.alteration.mode).toBe("amount");
  });

  /** Un barème n'est jamais une hausse : commander plus ne coûte pas plus cher. */
  it("accorde toujours une baisse", () => {
    const rule = ladderAsRule(ladder, context(120));

    expect(rule?.nature === "alter" && rule.alteration.direction).toBe("decrease");
  });
});
