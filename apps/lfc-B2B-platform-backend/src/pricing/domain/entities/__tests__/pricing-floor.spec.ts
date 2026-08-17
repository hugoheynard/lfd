import { PricingFloor, floorIdForScope } from "../pricing-floor.js";
import {
  FloorAboveCanonicalError,
  InvalidAlterationError,
  ScopeIdMismatchError,
} from "../../pricing-errors.js";

describe("PricingFloor.pose", () => {
  it("pose une limite en euros", () => {
    const floor = PricingFloor.pose(
      { type: "product", id: "VIE-001" },
      { mode: "amount", cents: 150 },
      "auth0|cecile",
    );

    expect(floor.asScopedFloor).toEqual({
      id: "product:VIE-001",
      scope: { type: "product", id: "VIE-001" },
      floor: { mode: "amount", cents: 150 },
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
    const first = PricingFloor.pose(scope, { mode: "amount", cents: 100 }, "a");
    const second = PricingFloor.pose(scope, { mode: "percent", bp: 4000 }, "b");

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
      PricingFloor.pose({ type: "global", id: null }, { mode: "percent", bp: 5000 }, "a"),
    ).not.toThrow();
  });

  /** 100 % pile est une limite légitime : « ne descend jamais sous le tarif ». */
  it("accepte 100 % du canonique", () => {
    expect(() =>
      PricingFloor.pose({ type: "global", id: null }, { mode: "percent", bp: 10_000 }, "a"),
    ).not.toThrow();
  });

  /**
   * Au-delà, ce n'est plus un plancher : ça RELÈVE tous les prix, y compris ceux
   * qu'aucune règle n'a touchés. Une hausse tarifaire déguisée en garde-fou,
   * saisie dans l'écran qui protège des hausses — personne n'irait la chercher là.
   */
  it("refuse une fraction supérieure au prix canonique", () => {
    expect(() =>
      PricingFloor.pose({ type: "global", id: null }, { mode: "percent", bp: 12_000 }, "a"),
    ).toThrow(FloorAboveCanonicalError);
  });

  it("refuse une portée « famille » qui ne nomme aucune famille", () => {
    expect(() =>
      PricingFloor.pose({ type: "category", id: null }, { mode: "amount", cents: 100 }, "a"),
    ).toThrow(ScopeIdMismatchError);
  });

  it("refuse une grandeur nulle", () => {
    expect(() =>
      PricingFloor.pose({ type: "global", id: null }, { mode: "amount", cents: 0 }, "a"),
    ).toThrow(InvalidAlterationError);
  });
});
