import { PricingFloor, floorIdForScope } from "../pricing-floor.js";
import {
  DynamicFloorNotBelowHardError,
  FloorAboveCanonicalError,
  InvalidAlterationError,
  ScopeIdMismatchError,
  UnlockableDynamicFloorError,
} from "../../pricing-errors.js";
import type { PriceFloorPolicy } from "../../floor-policy.js";
import type { PriceFloor } from "../../price-rule.js";

/** Un mur seul — le cas courant. */
function wall(hard: PriceFloor): PriceFloorPolicy {
  return { hard, dynamic: null };
}

describe("PricingFloor.pose", () => {
  it("pose un mur en euros, sans porte", () => {
    const floor = PricingFloor.pose(
      { type: "product", id: "VIE-001" },
      { hard: { mode: "amount", cents: 150 }, dynamic: null },
      "auth0|cecile",
    );

    expect(floor.asScopedFloor).toEqual({
      id: "product:VIE-001",
      scope: { type: "product", id: "VIE-001" },
      policy: { hard: { mode: "amount", cents: 150 }, dynamic: null },
    });
  });

  /**
   * L'identifiant **dérive de la portée**. C'est ce qui rend « une seule limite
   * par cible » structurel : deux planchers sur la même portée ne peuvent pas
   * même porter deux noms différents, donc re-poser est un remplacement, sans
   * lecture préalable ni course entre deux écritures.
   */
  it("deux limites sur la même portée portent le MÊME identifiant", () => {
    const scope = { type: "category", id: "viennoiserie" } as const;
    const first = PricingFloor.pose(scope, wall({ mode: "amount", cents: 100 }), "a");
    const second = PricingFloor.pose(scope, wall({ mode: "percent", bp: 4000 }), "b");

    expect(first.id).toBe(second.id);
    expect(first.id).toBe(floorIdForScope(scope));
  });

  it("distingue la portée globale de tout le reste", () => {
    expect(floorIdForScope({ type: "global", id: null })).not.toBe(
      floorIdForScope({ type: "category", id: "" }),
    );
  });

  it("accepte une fraction du canonique", () => {
    expect(() =>
      PricingFloor.pose({ type: "global", id: null }, wall({ mode: "percent", bp: 5000 }), "a"),
    ).not.toThrow();
  });

  /** 100 % pile est une limite légitime : « ne descend jamais sous le tarif ». */
  it("accepte 100 % du canonique", () => {
    expect(() =>
      PricingFloor.pose({ type: "global", id: null }, wall({ mode: "percent", bp: 10_000 }), "a"),
    ).not.toThrow();
  });

  /**
   * Au-delà, ce n'est plus un plancher : ça RELÈVE tous les prix, y compris ceux
   * qu'aucune règle n'a touchés. Une hausse tarifaire déguisée en garde-fou,
   * saisie dans l'écran qui protège des hausses — personne n'irait la chercher là.
   */
  it("refuse une fraction supérieure au prix canonique", () => {
    expect(() =>
      PricingFloor.pose({ type: "global", id: null }, wall({ mode: "percent", bp: 12_000 }), "a"),
    ).toThrow(FloorAboveCanonicalError);
  });

  it("refuse une portée « famille » qui ne nomme aucune famille", () => {
    expect(() =>
      PricingFloor.pose({ type: "category", id: null }, wall({ mode: "amount", cents: 100 }), "a"),
    ).toThrow(ScopeIdMismatchError);
  });

  it("refuse une grandeur nulle", () => {
    expect(() =>
      PricingFloor.pose({ type: "global", id: null }, wall({ mode: "amount", cents: 0 }), "a"),
    ).toThrow(InvalidAlterationError);
  });
});

describe("la porte", () => {
  const HARD = { mode: "amount", cents: 150 } as const;
  const scope = { type: "global", id: null } as const;

  it("s'ouvre sur une quantité, sur un volume, ou sur les deux", () => {
    expect(() =>
      PricingFloor.pose(
        scope,
        {
          hard: HARD,
          dynamic: {
            floor: { mode: "amount", cents: 120 },
            unlock: { minQuantity: 100, minVolumeRatioBp: null },
          },
        },
        "a",
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
        scope,
        {
          hard: HARD,
          dynamic: {
            floor: { mode: "amount", cents: 120 },
            unlock: { minQuantity: null, minVolumeRatioBp: null },
          },
        },
        "a",
      ),
    ).toThrow(UnlockableDynamicFloorError);
  });

  /** Une porte au-dessus du mur ne s'ouvre sur rien : le mur mordrait d'abord. */
  it("refuse une porte au-dessus du mur", () => {
    expect(() =>
      PricingFloor.pose(
        scope,
        {
          hard: HARD,
          dynamic: {
            floor: { mode: "amount", cents: 180 },
            unlock: { minQuantity: 100, minVolumeRatioBp: null },
          },
        },
        "a",
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
        scope,
        {
          hard: HARD,
          dynamic: {
            floor: { mode: "percent", bp: 4_000 },
            unlock: { minQuantity: 100, minVolumeRatioBp: null },
          },
        },
        "a",
      ),
    ).not.toThrow();
  });
});
