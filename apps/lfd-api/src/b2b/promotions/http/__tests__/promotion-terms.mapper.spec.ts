import { promotionTermsPayloadSchema, type PromotionTermsPayload } from "@lfd/contracts";

import {
  PromotionAudienceDuplicateCompanyError,
  PromotionAudienceSetEmptyError,
} from "../../domain/errors/promotion-audience-errors.js";
import {
  PromotionBlankTextError,
  PromotionLineOnlyOptionError,
  PromotionMissingTargetIdError,
  PromotionReversedWindowError,
} from "../../domain/errors/promotion-errors.js";
import { Promotion } from "../../domain/promotion.js";
import { FROM } from "../../domain/__tests__/promotion-terms.fixture.js";
import { promotionTermsOf } from "../promotion-terms.mapper.js";

/** Un corps de saisie valide : −20 % sur tout, pour tout le monde. */
function payload(overrides: Partial<PromotionTermsPayload> = {}): PromotionTermsPayload {
  return {
    internalName: "Promo",
    label: { fr: "−20 %", en: null, it: null },
    audienceLabels: { individuals: null, pros: null },
    reason: null,
    effect: { kind: "percent_off", value: 2000 },
    ownFloor: null,
    stacksOverMercuriale: false,
    cumulative: false,
    validFrom: "2026-11-01T00:00:00.000Z",
    validTo: null,
    audiences: [{ kind: "everyone", companyId: null }],
    fulfillment: { kind: "any", pickupId: null },
    scope: { mode: "all_except", rules: [] },
    conditions: [],
    ...overrides,
  };
}

/** Le contrôleur pose l'agrégat derrière le mapper : le refus nommé vient de lui. */
function pose(body: PromotionTermsPayload): Promotion {
  return Promotion.pose("promo_1", promotionTermsOf(body), "staff_1", FROM);
}

describe("promotionTermsOf — le corps reçu devient les termes", () => {
  it.each([
    ["percent_off", 1500, { kind: "percent_off", basisPoints: 1500 }],
    ["unit_amount_off", 5000, { kind: "unit_amount_off", millicents: 5000 }],
    ["fixed_unit_price", 90_000, { kind: "fixed_unit_price", millicents: 90_000 }],
    ["basket_amount_off", 300, { kind: "basket_amount_off", cents: 300 }],
  ] as const)("l'effet %s porte sa valeur dans SON unité", (kind, value, expected) => {
    expect(promotionTermsOf(payload({ effect: { kind, value } })).effect).toEqual(expected);
  });

  it("garde les deux bornes de la fenêtre, `null` = sans fin", () => {
    const open = promotionTermsOf(payload());
    expect(open.validFrom).toEqual(new Date("2026-11-01T00:00:00.000Z"));
    expect(open.validTo).toBeNull();
    const closed = promotionTermsOf(payload({ validTo: "2026-12-01T00:00:00.000Z" }));
    expect(closed.validTo).toEqual(new Date("2026-12-01T00:00:00.000Z"));
  });

  it("une saisie ne pose jamais de rang de cible", () => {
    const terms = promotionTermsOf(
      payload({
        scope: { mode: "only", rules: [{ target: "variant", targetId: "S1", eligible: true }] },
      }),
    );
    expect(terms.scope.rules).toEqual([
      { target: "variant", targetId: "S1", eligible: true, targetRank: null },
    ]);
  });

  describe("le public", () => {
    it("tous les enfants d'un parent ⇒ le parent, quel que soit l'ordre reçu", () => {
      const terms = promotionTermsOf(
        payload({
          audiences: [
            { kind: "individuals_registered", companyId: null },
            { kind: "individuals_guest", companyId: null },
          ],
        }),
      );
      expect(terms.audiences.targets).toEqual([{ kind: "individuals" }]);
    });

    it("une cible ET son ancêtre se ramènent à l'ancêtre", () => {
      const terms = promotionTermsOf(
        payload({
          audiences: [
            { kind: "pros_active", companyId: null },
            { kind: "pros", companyId: null },
          ],
        }),
      );
      expect(terms.audiences.targets).toEqual([{ kind: "pros" }]);
    });

    it("une société et ses sites absorbe la société seule", () => {
      const terms = promotionTermsOf(
        payload({
          audiences: [
            { kind: "company", companyId: "co_1" },
            { kind: "company_and_sites", companyId: "co_1" },
          ],
        }),
      );
      expect(terms.audiences.targets).toEqual([{ kind: "company_and_sites", companyId: "co_1" }]);
    });

    it("refuse un ensemble vide", () => {
      expect(() => promotionTermsOf(payload({ audiences: [] }))).toThrow(
        PromotionAudienceSetEmptyError,
      );
    });

    it("refuse la même société deux fois sous la même forme", () => {
      expect(() =>
        promotionTermsOf(
          payload({
            audiences: [
              { kind: "company", companyId: "co_1" },
              { kind: "company", companyId: "co_1" },
            ],
          }),
        ),
      ).toThrow(PromotionAudienceDuplicateCompanyError);
    });

    it.each(["company", "company_and_sites"] as const)(
      "refuse %s sans identifiant de société — jamais une société inventée",
      (kind) => {
        expect(() => promotionTermsOf(payload({ audiences: [{ kind, companyId: null }] }))).toThrow(
          PromotionMissingTargetIdError,
        );
      },
    );

    it("ignore un `companyId` porté par un public de clientèle", () => {
      const terms = promotionTermsOf(
        payload({ audiences: [{ kind: "pros", companyId: "co_perdu" }] }),
      );
      expect(terms.audiences.targets).toEqual([{ kind: "pros" }]);
    });
  });

  describe("l'acheminement", () => {
    it("refuse un point de retrait sans identifiant", () => {
      expect(() =>
        promotionTermsOf(payload({ fulfillment: { kind: "pickup_point", pickupId: null } })),
      ).toThrow(PromotionMissingTargetIdError);
    });

    it("n'emporte pas l'identifiant d'un point quand l'acheminement n'en vise pas", () => {
      const terms = promotionTermsOf(
        payload({ fulfillment: { kind: "pickup", pickupId: "pk_1" } }),
      );
      expect(terms.fulfillment).toEqual({ kind: "pickup" });
    });
  });

  describe("les refus de l'agrégat remontent nommés, derrière le mapper", () => {
    it("une fenêtre inversée", () => {
      expect(() => pose(payload({ validTo: "2026-10-01T00:00:00.000Z" }))).toThrow(
        PromotionReversedWindowError,
      );
    });

    it("une fenêtre vide (fin = début) : la fin est exclue", () => {
      expect(() => pose(payload({ validTo: "2026-11-01T00:00:00.000Z" }))).toThrow(
        PromotionReversedWindowError,
      );
    });

    it("« Cumulable » sur une promotion de panier", () => {
      expect(() =>
        pose(
          payload({
            cumulative: true,
            effect: { kind: "percent_off", value: 1000 },
            fulfillment: { kind: "pickup_point", pickupId: "pk_1" },
          }),
        ),
      ).toThrow(PromotionLineOnlyOptionError);
    });

    it("un libellé commun d'espaces", () => {
      expect(() => pose(payload({ label: { fr: "  ", en: null, it: null } }))).toThrow(
        PromotionBlankTextError,
      );
    });
  });
});

describe("promotionTermsPayloadSchema — la forme du corps (§ 3 : trois états d'une absence)", () => {
  const wire = payload();

  it("refuse un libellé anglais ou italien sans français", () => {
    const { fr: _fr, ...withoutFr } = wire.label;
    expect(promotionTermsPayloadSchema.safeParse({ ...wire, label: withoutFr }).success).toBe(
      false,
    );
  });

  it.each(["en", "it"] as const)(
    "une locale %s VIDÉE n'est pas acceptée en chaîne vide : elle s'envoie `null`",
    (locale) => {
      const label = { ...wire.label, [locale]: "  " };
      expect(promotionTermsPayloadSchema.safeParse({ ...wire, label }).success).toBe(false);
      const cleared = { ...wire.label, [locale]: null };
      expect(promotionTermsPayloadSchema.safeParse({ ...wire, label: cleared }).success).toBe(true);
    },
  );

  it("un motif vide est refusé, `null` = aucun", () => {
    expect(promotionTermsPayloadSchema.safeParse({ ...wire, reason: "" }).success).toBe(false);
    expect(promotionTermsPayloadSchema.safeParse({ ...wire, reason: null }).success).toBe(true);
  });

  it("un public absent est refusé ; `cumulative` et les libellés d'audience absents prennent leur défaut", () => {
    const { audiences: _a, cumulative: _c, audienceLabels: _l, ...rest } = wire;
    expect(promotionTermsPayloadSchema.safeParse(rest).success).toBe(false);
    const parsed = promotionTermsPayloadSchema.safeParse({
      ...rest,
      audiences: [{ kind: "everyone", companyId: null }],
    });
    expect(parsed.success && parsed.data.cumulative).toBe(false);
    expect(parsed.success && parsed.data.audienceLabels).toEqual({ individuals: null, pros: null });
  });

  it("refuse une date sans fuseau et une valeur d'effet décimale", () => {
    expect(
      promotionTermsPayloadSchema.safeParse({ ...wire, validFrom: "2026-11-01" }).success,
    ).toBe(false);
    expect(
      promotionTermsPayloadSchema.safeParse({
        ...wire,
        effect: { kind: "percent_off", value: 12.5 },
      }).success,
    ).toBe(false);
  });
});
