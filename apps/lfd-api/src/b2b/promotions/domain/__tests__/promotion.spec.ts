import {
  ArchivedPromotionIsSealedError,
  PromotionAlreadyPausedError,
  PromotionArchiveReasonMissingError,
  PromotionBlankTextError,
  PromotionCategoryAgainstModeError,
  PromotionDuplicateScopeRuleError,
  PromotionEffectPointMismatchError,
  PromotionInvalidConditionError,
  PromotionInvalidEffectError,
  PromotionInvalidOwnFloorError,
  PromotionInvalidTargetRankError,
  PromotionLineOnlyOptionError,
  PromotionMissingTargetIdError,
  PromotionNotPausedError,
  PromotionProductTargetAtLineError,
  PromotionReversedWindowError,
  PromotionScopeIncludesNothingError,
} from "../errors/promotion-errors.js";
import { Promotion } from "../promotion.js";
import type { PromotionTerms } from "../promotion-terms.js";
import { FROM, UNTIL, basketTerms, lineTerms } from "./promotion-terms.fixture.js";

const STAFF = "staff_hugo";
const LATER = new Date(FROM.getTime() + 3_600_000);

function pose(terms: PromotionTerms = lineTerms()): Promotion {
  return Promotion.pose("promo_1", terms, STAFF, FROM);
}

describe("Promotion.pose — les invariants des termes", () => {
  it("pose une promotion active, sans origine, au point dérivé de l'acheminement", () => {
    const line = pose();
    expect(line.status).toBe("active");
    expect(line.applicationPoint).toBe("line");
    expect(line.toPersistence()).toMatchObject({
      origin: null,
      legacySource: null,
      createdBy: STAFF,
    });
    expect(pose(basketTerms()).applicationPoint).toBe("basket");
  });

  it.each([
    ["un nom interne vide", lineTerms({ internalName: "  " })],
    ["un libellé vide", lineTerms({ label: { fr: "", en: null, it: null } })],
    ["un libellé anglais vide", lineTerms({ label: { fr: "Promo", en: " ", it: null } })],
  ])("refuse %s", (_case, terms) => {
    expect(() => pose(terms)).toThrow(PromotionBlankTextError);
  });

  it("refuse une fenêtre qui se ferme avant de s'ouvrir, ou à l'instant même", () => {
    expect(() => pose(lineTerms({ validFrom: UNTIL, validTo: FROM }))).toThrow(
      PromotionReversedWindowError,
    );
    expect(() => pose(lineTerms({ validTo: FROM }))).toThrow(PromotionReversedWindowError);
    expect(pose(lineTerms({ validTo: UNTIL })).terms.validTo).toEqual(UNTIL);
  });

  it.each([
    [{ kind: "percent_off", basisPoints: 0 }],
    [{ kind: "percent_off", basisPoints: 10_001 }],
    [{ kind: "percent_off", basisPoints: 12.5 }],
    [{ kind: "unit_amount_off", millicents: 0 }],
    [{ kind: "fixed_unit_price", millicents: -1 }],
  ] as const)("refuse l'effet %j", (effect) => {
    expect(() => pose(lineTerms({ effect }))).toThrow(PromotionInvalidEffectError);
  });

  it("admet un prix posé à zéro et 100 %", () => {
    expect(() =>
      pose(lineTerms({ effect: { kind: "fixed_unit_price", millicents: 0 } })),
    ).not.toThrow();
    expect(() =>
      pose(lineTerms({ effect: { kind: "percent_off", basisPoints: 10_000 } })),
    ).not.toThrow();
  });

  it("refuse un effet étranger au point d'application", () => {
    expect(() => pose(lineTerms({ effect: { kind: "basket_amount_off", cents: 500 } }))).toThrow(
      PromotionEffectPointMismatchError,
    );
    expect(() =>
      pose(basketTerms({ effect: { kind: "fixed_unit_price", millicents: 100 } })),
    ).toThrow(PromotionEffectPointMismatchError);
    expect(() =>
      pose(basketTerms({ effect: { kind: "unit_amount_off", millicents: 100 } })),
    ).toThrow(PromotionEffectPointMismatchError);
    expect(() =>
      pose(basketTerms({ effect: { kind: "basket_amount_off", cents: 500 } })),
    ).not.toThrow();
  });

  it("refuse au panier le plancher propre et le cumul sur mercuriale", () => {
    expect(() => pose(basketTerms({ ownFloor: { mode: "percent", value: 5000 } }))).toThrow(
      PromotionLineOnlyOptionError,
    );
    expect(() => pose(basketTerms({ stacksOverMercuriale: true }))).toThrow(
      PromotionLineOnlyOptionError,
    );
    expect(() => pose(lineTerms({ stacksOverMercuriale: true }))).not.toThrow();
  });

  it("refuse un plancher propre au-delà de 100 % ou négatif", () => {
    expect(() => pose(lineTerms({ ownFloor: { mode: "percent", value: 10_001 } }))).toThrow(
      PromotionInvalidOwnFloorError,
    );
    expect(() => pose(lineTerms({ ownFloor: { mode: "amount", value: -1 } }))).toThrow(
      PromotionInvalidOwnFloorError,
    );
  });

  it("refuse une société ou un point nommés à vide", () => {
    expect(() => pose(lineTerms({ audience: { kind: "company", companyId: "" } }))).toThrow(
      PromotionMissingTargetIdError,
    );
    expect(() =>
      pose(basketTerms({ fulfillment: { kind: "pickup_point", pickupId: " " } })),
    ).toThrow(PromotionMissingTargetIdError);
  });

  describe("la portée", () => {
    const rule = (
      target: "category" | "product" | "variant",
      targetId: string,
      eligible: boolean,
    ) => ({
      target,
      targetId,
      eligible,
      targetRank: null,
    });

    it("refuse « seulement » sans inclusion", () => {
      expect(() =>
        pose(lineTerms({ scope: { mode: "only", rules: [rule("product", "p_1", false)] } })),
      ).toThrow(PromotionScopeIncludesNothingError);
    });

    it("refuse une famille à contre-sens du mode, dans les deux modes", () => {
      expect(() =>
        pose(
          lineTerms({
            scope: {
              mode: "only",
              rules: [rule("category", "c_1", false), rule("product", "p_1", true)],
            },
          }),
        ),
      ).toThrow(PromotionCategoryAgainstModeError);
      expect(() =>
        pose(lineTerms({ scope: { mode: "all_except", rules: [rule("category", "c_1", true)] } })),
      ).toThrow(PromotionCategoryAgainstModeError);
    });

    it("admet un produit à contre-sens au panier : c'est la réinclusion", () => {
      const scope = {
        mode: "all_except" as const,
        rules: [rule("category", "c_1", false), rule("product", "p_1", true)],
      };
      expect(pose(basketTerms({ scope })).terms.scope).toEqual(scope);
    });

    /**
     * L7 (2026-10-30) : la chaîne de prix ne connaît que le SKU, et le tarif
     * est à plat — un produit entier ne se vise qu'au panier.
     */
    it("refuse un produit entier au point ligne, dans les deux modes, et à la relecture", () => {
      const excluding = { mode: "all_except" as const, rules: [rule("product", "p_1", false)] };
      const including = { mode: "only" as const, rules: [rule("product", "p_1", true)] };
      expect(() => pose(lineTerms({ scope: excluding }))).toThrow(
        PromotionProductTargetAtLineError,
      );
      expect(() => pose(lineTerms({ scope: including }))).toThrow(
        PromotionProductTargetAtLineError,
      );
      const state = pose(basketTerms({ scope: excluding })).toPersistence();
      expect(() => Promotion.restore({ ...state, fulfillment: { kind: "any" } })).toThrow(
        PromotionProductTargetAtLineError,
      );
    });

    it("admet une famille ou une déclinaison au point ligne", () => {
      const scope = {
        mode: "all_except" as const,
        rules: [rule("category", "c_1", false), rule("variant", "VIE-001-1", true)],
      };
      expect(pose(lineTerms({ scope })).terms.scope).toEqual(scope);
    });

    it("refuse une cible réglée deux fois", () => {
      expect(() =>
        pose(
          lineTerms({
            scope: {
              mode: "only",
              rules: [rule("variant", "S", true), rule("variant", "S", false)],
            },
          }),
        ),
      ).toThrow(PromotionDuplicateScopeRuleError);
    });

    it("n'admet un rang posé que sur une déclinaison, et seulement 2", () => {
      const ranked = (target: "category" | "variant", targetRank: number) => ({
        mode: "only" as const,
        rules: [{ target, targetId: "x", eligible: true, targetRank }],
      });
      expect(() => pose(lineTerms({ scope: ranked("variant", 2) }))).not.toThrow();
      expect(() => pose(lineTerms({ scope: ranked("variant", 3) }))).toThrow(
        PromotionInvalidTargetRankError,
      );
      expect(() => pose(lineTerms({ scope: ranked("category", 2) }))).toThrow(
        PromotionInvalidTargetRankError,
      );
    });
  });

  it("refuse une quantité minimum nulle ou fractionnaire", () => {
    expect(() => pose(lineTerms({ conditions: [{ kind: "min_quantity", value: 0 }] }))).toThrow(
      PromotionInvalidConditionError,
    );
    expect(() => pose(lineTerms({ conditions: [{ kind: "min_quantity", value: 1.5 }] }))).toThrow(
      PromotionInvalidConditionError,
    );
    expect(
      pose(lineTerms({ conditions: [{ kind: "min_quantity", value: 10 }] })).terms.conditions,
    ).toEqual([{ kind: "min_quantity", value: 10 }]);
  });
});

describe("Promotion — le cycle de vie", () => {
  it("se suspend, refuse une seconde pause, puis reprend", () => {
    const paused = pose().pause(STAFF, LATER);
    expect(paused.status).toBe("paused");
    expect(paused.toPersistence().paused).toEqual({ at: LATER, by: STAFF });
    expect(() => paused.pause(STAFF, LATER)).toThrow(PromotionAlreadyPausedError);
    expect(paused.resume().status).toBe("active");
  });

  it("refuse de reprendre ce qui n'est pas suspendu", () => {
    expect(() => pose().resume()).toThrow(PromotionNotPausedError);
  });

  it("s'archive avec un motif, et devient scellée", () => {
    const archived = pose().pause(STAFF, LATER).archive(STAFF, LATER, "fin de saison");
    expect(archived.status).toBe("archived");
    expect(archived.toPersistence().archived).toEqual({
      at: LATER,
      by: STAFF,
      reason: "fin de saison",
    });
    expect(() => archived.resume()).toThrow(ArchivedPromotionIsSealedError);
    expect(() => archived.pause(STAFF, LATER)).toThrow(ArchivedPromotionIsSealedError);
    expect(() => archived.revise(lineTerms())).toThrow(ArchivedPromotionIsSealedError);
    expect(() => archived.archive(STAFF, LATER, "encore")).toThrow(ArchivedPromotionIsSealedError);
  });

  it("refuse l'archivage sans motif", () => {
    expect(() => pose().archive(STAFF, LATER, " ")).toThrow(PromotionArchiveReasonMissingError);
  });

  it("se révise en gardant identité, auteur, pause et origine", () => {
    const paused = pose().pause(STAFF, LATER);
    const revised = paused.revise(basketTerms());
    expect(revised.id).toBe("promo_1");
    expect(revised.status).toBe("paused");
    expect(revised.applicationPoint).toBe("basket");
    expect(revised.toPersistence()).toMatchObject({ createdBy: STAFF, createdAt: FROM });
  });

  it("refuse une révision qui viole un invariant, sans rien changer", () => {
    const promotion = pose();
    expect(() => promotion.revise(lineTerms({ internalName: "" }))).toThrow(
      PromotionBlankTextError,
    );
    expect(promotion.terms.internalName).toBe("Promo d'automne");
  });
});

describe("Promotion.restore — la relecture revalide", () => {
  it("relit un état valide, origine de reprise comprise", () => {
    const state = {
      ...pose().toPersistence(),
      origin: { kind: "price_rule" as const, ruleId: "rule_1" },
      legacySource: "price_rule:rule_1",
    };
    expect(Promotion.restore(state).toPersistence()).toEqual(state);
  });

  it("refuse une ligne qui contourne un invariant (reprise SQL fautive)", () => {
    const state = { ...pose().toPersistence(), scope: { mode: "only" as const, rules: [] } };
    expect(() => Promotion.restore(state)).toThrow(PromotionScopeIncludesNothingError);
  });
});
