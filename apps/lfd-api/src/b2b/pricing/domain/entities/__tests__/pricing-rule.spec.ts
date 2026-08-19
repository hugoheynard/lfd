import { PricingRule, type PricingRuleDraft } from "../pricing-rule.js";
import {
  InvalidAlterationError,
  MercurialeCannotStackOverItselfError,
  MercurialeMustPoseAPriceError,
  ReversedValidityWindowError,
  ScopeIdMismatchError,
} from "../../pricing-errors.js";

const FROM = new Date("2026-01-01T00:00:00.000Z");

function draft(overrides: Partial<PricingRuleDraft> = {}): PricingRuleDraft {
  return {
    stage: "promotion",
    scope: { type: "global", id: null },
    audience: { type: "all", id: null },
    minQuantity: null,
    effect: {
      nature: "alter",
      alteration: { direction: "decrease", mode: "percent", bp: 1000 },
    },
    label: "Promo de rentrée",
    stacksOverMercuriale: false,
    validFrom: FROM,
    validTo: null,
    ...overrides,
  };
}

const create = (overrides: Partial<PricingRuleDraft> = {}): PricingRule =>
  PricingRule.create("rule_1", draft(overrides), "auth0|cecile");

describe("PricingRule.create", () => {
  it("accepte une règle bien formée et retient qui l'a posée", () => {
    expect(create().toPersistence()).toMatchObject({ id: "rule_1", createdBy: "auth0|cecile" });
  });

  /**
   * **Le refus qui compte.** Une mercuriale en pourcentage suit le tarif de
   * liste : le jour où le PIM augmente, le prix négocié augmente avec lui — ce
   * n'est pas ce qui a été promis au client.
   */
  it("refuse une mercuriale exprimée en pourcentage", () => {
    expect(() => create({ stage: "mercuriale" })).toThrow(MercurialeMustPoseAPriceError);
  });

  /**
   * `stacksOverMercuriale` est la **porte de sortie** d'un scellement. Sur
   * l'étage qui scelle, elle ne désigne rien : le refus vaut mieux que le
   * silence, parce qu'un drapeau accepté puis sans effet finit par être coché
   * en croyant obtenir quelque chose.
   */
  it("refuse une mercuriale qui se déclare cumulable par-dessus une mercuriale", () => {
    expect(() =>
      create({
        stage: "mercuriale",
        effect: { nature: "replace", amountCents: 210 },
        stacksOverMercuriale: true,
      }),
    ).toThrow(MercurialeCannotStackOverItselfError);
  });

  it("porte le drapeau de cumul jusqu'à la forme que lit la résolution", () => {
    const rule = create({ stacksOverMercuriale: true });

    expect(rule.asPriceRule.stacksOverMercuriale).toBe(true);
  });

  it("accepte une mercuriale qui pose un prix en euros", () => {
    const rule = create({
      stage: "mercuriale",
      effect: { nature: "replace", amountCents: 210 },
    });

    expect(rule.asPriceRule).toMatchObject({ nature: "replace", amountCents: 210 });
  });

  /**
   * Volontairement plus étroit que le tableau du doc, qui assigne une nature à
   * chaque étage : « pendant l'opération, cet article est à 1,80 € » est une
   * décision commerciale réelle, et rien ne se casse à l'autoriser. Un invariant
   * sans raison finit contourné plutôt que compris.
   */
  it("laisse les AUTRES étages poser un prix ferme", () => {
    expect(() =>
      create({ stage: "promotion", effect: { nature: "replace", amountCents: 180 } }),
    ).not.toThrow();
  });

  it("accepte un article offert : zéro est un prix", () => {
    expect(() =>
      create({ stage: "geste", effect: { nature: "replace", amountCents: 0 } }),
    ).not.toThrow();
  });

  describe("la portée et l'audience doivent se tenir", () => {
    it("refuse une portée « famille » qui ne nomme aucune famille", () => {
      expect(() => create({ scope: { type: "category", id: null } })).toThrow(ScopeIdMismatchError);
    });

    it("refuse une portée globale qui nomme quand même une cible", () => {
      expect(() => create({ scope: { type: "global", id: "viennoiserie" } })).toThrow(
        ScopeIdMismatchError,
      );
    });

    it("refuse une audience « client » sans client", () => {
      expect(() => create({ audience: { type: "company", id: null } })).toThrow(
        ScopeIdMismatchError,
      );
    });

    it("refuse une audience « tous » qui nomme un client", () => {
      expect(() => create({ audience: { type: "all", id: "cmp_1" } })).toThrow(
        ScopeIdMismatchError,
      );
    });
  });

  describe("la fenêtre de validité", () => {
    it("refuse une fin antérieure au début", () => {
      expect(() => create({ validTo: new Date("2025-01-01T00:00:00.000Z") })).toThrow(
        ReversedValidityWindowError,
      );
    });

    /** Borne haute EXCLUE : une fenêtre qui se ferme à son ouverture est vide. */
    it("refuse une fin égale au début", () => {
      expect(() => create({ validTo: FROM })).toThrow(ReversedValidityWindowError);
    });

    it("accepte une fenêtre ouverte", () => {
      expect(() => create({ validTo: null })).not.toThrow();
    });
  });

  describe("la grandeur d'une altération", () => {
    it("refuse zéro — « réduire de 0 % » n'est pas une décision", () => {
      expect(() =>
        create({
          effect: {
            nature: "alter",
            alteration: { direction: "decrease", mode: "percent", bp: 0 },
          },
        }),
      ).toThrow(InvalidAlterationError);
    });

    /** Le signe se dit par `direction`, jamais par le nombre. */
    it("refuse une grandeur négative", () => {
      expect(() =>
        create({
          effect: {
            nature: "alter",
            alteration: { direction: "increase", mode: "amount", cents: -50 },
          },
        }),
      ).toThrow(InvalidAlterationError);
    });
  });
});
