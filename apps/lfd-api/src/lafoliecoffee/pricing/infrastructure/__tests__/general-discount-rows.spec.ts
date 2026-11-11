import { CorruptedMercurialeError } from "../../domain/pricing-errors.js";
import {
  generalDiscountFromJson,
  generalDiscountJson,
  parsedGeneralDiscount,
} from "../general-discount-rows.js";

const DISCOUNT = {
  mode: "all_except" as const,
  baseBp: 3_000,
  rules: [{ target: "variant" as const, targetId: "VIE-001", bp: null }],
};

describe("la remise générale ↔ jsonb", () => {
  it("fait l'aller-retour sans perte", () => {
    expect(generalDiscountFromJson("m", generalDiscountJson(DISCOUNT))).toEqual(DISCOUNT);
  });

  it("`null` en base = aucune remise", () => {
    expect(generalDiscountFromJson("m", null)).toBeNull();
  });

  it("refuse en 500 une forme inattendue (cible inconnue)", () => {
    expect(() =>
      generalDiscountFromJson("m", {
        ...DISCOUNT,
        rules: [{ target: "product", targetId: "x", bp: 1 }],
      }),
    ).toThrow(CorruptedMercurialeError);
  });

  it("refuse en 500 une remise que le domaine refuserait (« seulement » avec un taux de base)", () => {
    expect(() => generalDiscountFromJson("m", { ...DISCOUNT, mode: "only" })).toThrow(
      CorruptedMercurialeError,
    );
  });

  it("le brouillon lit la forme seule, et rend `null` sur l'illisible", () => {
    expect(parsedGeneralDiscount({ mode: "only", baseBp: null, rules: [] })).toEqual({
      mode: "only",
      baseBp: null,
      rules: [],
    });
    expect(parsedGeneralDiscount("trente pour cent")).toBeNull();
  });
});
