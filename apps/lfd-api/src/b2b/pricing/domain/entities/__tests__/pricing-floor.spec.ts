import { PricingFloor, floorScopeKey } from "../pricing-floor.js";
import {
  AmountFloorOnBroadScopeError,
  DynamicFloorNotBelowHardError,
  FloorAboveCanonicalError,
  InvalidAlterationError,
  ScopeIdMismatchError,
  UnlockableDynamicFloorError,
} from "../../pricing-errors.js";
import type { PriceFloorPolicy } from "../../floor-policy.js";
import type { PriceFloor } from "../../price-rule.js";

/** Un mur seul — le cas courant. */
const POSED_AT = new Date("2026-06-15T09:00:00.000Z");

function wall(hard: PriceFloor): PriceFloorPolicy {
  return { hard, dynamic: null };
}

describe("PricingFloor.pose", () => {
  it("pose un mur en euros, sans porte", () => {
    const floor = PricingFloor.pose(
      "flr_1",
      { type: "product", id: "VIE-001" },
      { hard: { mode: "amount", millicents: 150 }, dynamic: null },
      "auth0|cecile",
      POSED_AT,
    );

    expect(floor.asScopedFloor).toEqual({
      id: "flr_1",
      scope: { type: "product", id: "VIE-001" },
      policy: { hard: { mode: "amount", millicents: 150 }, dynamic: null },
      validFrom: POSED_AT,
      validTo: null,
    });
  });

  /**
   * ⚠️ **Ce cas affirmait l'inverse jusqu'au 2026-09-09** : « deux limites sur la
   * même portée portent le MÊME identifiant », parce que l'identifiant dérivait
   * de la portée. C'est ce qui rendait « une seule limite par cible »
   * structurel — et c'est aussi ce qui **réécrivait** la précédente en re-posant,
   * donc ce qui rendait le passé illisible.
   *
   * Les planchers sont versionnés depuis : N lignes par portée, une par période.
   * La portée reste une clé de REGROUPEMENT — l'écran adresse toujours « le
   * plancher de cette catégorie » — mais elle n'identifie plus une ligne.
   */
  it("deux limites sur la même portée sont DEUX décisions, groupées par la portée", () => {
    const scope = { type: "category", id: "viennoiserie" } as const;
    const first = PricingFloor.pose(
      "flr_1",
      scope,
      wall({ mode: "percent", bp: 6_000 }),
      "a",
      POSED_AT,
    );
    const second = PricingFloor.pose(
      "flr_2",
      scope,
      wall({ mode: "percent", bp: 4000 }),
      "b",
      POSED_AT,
    );

    expect(first.id).not.toBe(second.id);
    expect(floorScopeKey(first.asScopedFloor.scope)).toBe(
      floorScopeKey(second.asScopedFloor.scope),
    );
  });

  it("distingue la portée globale de tout le reste", () => {
    expect(floorScopeKey({ type: "global", id: null })).not.toBe(
      floorScopeKey({ type: "category", id: "" }),
    );
  });

  it("accepte une fraction du canonique", () => {
    expect(() =>
      PricingFloor.pose(
        "flr_1",
        { type: "global", id: null },
        wall({ mode: "percent", bp: 5000 }),
        "a",
        POSED_AT,
      ),
    ).not.toThrow();
  });

  /** 100 % pile est une limite légitime : « ne descend jamais sous le tarif ». */
  it("accepte 100 % du canonique", () => {
    expect(() =>
      PricingFloor.pose(
        "flr_1",
        { type: "global", id: null },
        wall({ mode: "percent", bp: 10_000 }),
        "a",
        POSED_AT,
      ),
    ).not.toThrow();
  });

  /**
   * Au-delà, ce n'est plus un plancher : ça RELÈVE tous les prix, y compris ceux
   * qu'aucune règle n'a touchés. Une hausse tarifaire déguisée en garde-fou,
   * saisie dans l'écran qui protège des hausses — personne n'irait la chercher là.
   */
  it("refuse une fraction supérieure au prix canonique", () => {
    expect(() =>
      PricingFloor.pose(
        "flr_1",
        { type: "global", id: null },
        wall({ mode: "percent", bp: 12_000 }),
        "a",
        POSED_AT,
      ),
    ).toThrow(FloorAboveCanonicalError);
  });

  it("refuse une portée « famille » qui ne nomme aucune famille", () => {
    expect(() =>
      PricingFloor.pose(
        "flr_1",
        { type: "category", id: null },
        wall({ mode: "amount", millicents: 100 }),
        "a",
        POSED_AT,
      ),
    ).toThrow(ScopeIdMismatchError);
  });

  it("refuse une grandeur nulle", () => {
    expect(() =>
      PricingFloor.pose(
        "flr_1",
        { type: "product", id: "VIE-001" },
        wall({ mode: "amount", millicents: 0 }),
        "a",
        POSED_AT,
      ),
    ).toThrow(InvalidAlterationError);
  });
});

describe("la porte", () => {
  const HARD = { mode: "amount", millicents: 150 } as const;
  // Une porte en euros ne se pose que sur un ARTICLE : au-delà, le montant ne
  // veut rien dire. Cf. le bloc « une limite en euros » plus bas.
  const scope = { type: "product", id: "VIE-001" } as const;

  it("s'ouvre sur une quantité, sur un volume, ou sur les deux", () => {
    expect(() =>
      PricingFloor.pose(
        "flr_1",
        scope,
        {
          hard: HARD,
          dynamic: {
            floor: { mode: "amount", millicents: 120 },
            unlock: { minQuantity: 100, minVolumeRatioBp: null },
          },
        },
        "a",
        POSED_AT,
      ),
    ).not.toThrow();
  });

  /**
   * Une porte sans clé serait un mur plus bas : le plancher dur ne servirait
   * plus à rien, et personne ne verrait qu'il a été contourné — puisque l'écran
   * continuerait de l'afficher.
   */
  it("refuse une porte sans clé", () => {
    expect(() =>
      PricingFloor.pose(
        "flr_1",
        scope,
        {
          hard: HARD,
          dynamic: {
            floor: { mode: "amount", millicents: 120 },
            unlock: { minQuantity: null, minVolumeRatioBp: null },
          },
        },
        "a",
        POSED_AT,
      ),
    ).toThrow(UnlockableDynamicFloorError);
  });

  /** Une porte au-dessus du mur ne s'ouvre sur rien : le mur mordrait d'abord. */
  it("refuse une porte au-dessus du mur", () => {
    expect(() =>
      PricingFloor.pose(
        "flr_1",
        scope,
        {
          hard: HARD,
          dynamic: {
            floor: { mode: "amount", millicents: 180 },
            unlock: { minQuantity: 100, minVolumeRatioBp: null },
          },
        },
        "a",
        POSED_AT,
      ),
    ).toThrow(DynamicFloorNotBelowHardError);
  });

  /**
   * Deux unités différentes ne se comparent pas sans connaître l'article — et
   * cet agrégat peut porter sur toute une famille. La comparaison se fera à la
   * résolution, article par article, où elle a enfin un sens.
   */
  it("laisse passer deux unités différentes, qu'elle ne peut pas comparer ici", () => {
    expect(() =>
      PricingFloor.pose(
        "flr_1",
        scope,
        {
          hard: HARD,
          dynamic: {
            floor: { mode: "percent", bp: 4_000 },
            unlock: { minQuantity: 100, minVolumeRatioBp: null },
          },
        },
        "a",
        POSED_AT,
      ),
    ).not.toThrow();
  });
});

/**
 * **Une limite en euros n'a de sens que sur une unité.**
 *
 * « Jamais sous 1,50 € » sur tout le catalogue laisserait passer une pièce
 * montée à 1,50 € et relèverait un croissant qui se vend 2,00 € : le même mur,
 * deux effets opposés. Une fraction, elle, suit l'article.
 */
describe("une limite en euros", () => {
  const AMOUNT = { mode: "amount", millicents: 150 } as const;

  it("se pose sur un article", () => {
    expect(() =>
      PricingFloor.pose("flr_1", { type: "product", id: "VIE-001" }, wall(AMOUNT), "a", POSED_AT),
    ).not.toThrow();
  });

  it("se pose sur une déclinaison", () => {
    expect(() =>
      PricingFloor.pose("flr_1", { type: "variant", id: "VIE-001-1" }, wall(AMOUNT), "a", POSED_AT),
    ).not.toThrow();
  });

  it("est refusée sur une famille", () => {
    expect(() =>
      PricingFloor.pose(
        "flr_1",
        { type: "category", id: "viennoiserie" },
        wall(AMOUNT),
        "a",
        POSED_AT,
      ),
    ).toThrow(AmountFloorOnBroadScopeError);
  });

  it("est refusée sur tout le catalogue", () => {
    expect(() =>
      PricingFloor.pose("flr_1", { type: "global", id: null }, wall(AMOUNT), "a", POSED_AT),
    ).toThrow(AmountFloorOnBroadScopeError);
  });

  /** Le refus vaut aussi pour la PORTE : elle est une limite, comme le mur. */
  it("est refusée sur la porte d'une portée large", () => {
    expect(() =>
      PricingFloor.pose(
        "flr_1",
        { type: "category", id: "viennoiserie" },
        {
          hard: { mode: "percent", bp: 6_000 },
          dynamic: {
            floor: { mode: "amount", millicents: 120 },
            unlock: { minQuantity: 100, minVolumeRatioBp: null },
          },
        },
        "a",
        POSED_AT,
      ),
    ).toThrow(AmountFloorOnBroadScopeError);
  });

  /** Une fraction, elle, suit l'article : elle passe partout. */
  it("laisse passer une fraction sur toutes les portées", () => {
    const percent = wall({ mode: "percent", bp: 6_000 });

    expect(() =>
      PricingFloor.pose("flr_1", { type: "global", id: null }, percent, "a", POSED_AT),
    ).not.toThrow();
    expect(() =>
      PricingFloor.pose("flr_1", { type: "category", id: "viennoiserie" }, percent, "a", POSED_AT),
    ).not.toThrow();
  });
});
