import {
  amendCompanyMercurialePayloadSchema,
  generalDiscountSchema,
  poseCompanyMercurialePayloadSchema,
} from "../index.js";

const DISCOUNT = {
  mode: "all_except",
  baseBp: 3_000,
  rules: [{ target: "category", targetId: "fam-pains", bp: 4_000 }],
};

describe("la remise générale au contrat", () => {
  it("admet une pose à remise seule, sans ligne ni fin", () => {
    const parsed = poseCompanyMercurialePayloadSchema.safeParse({
      label: "Remise",
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: null,
      lines: [],
      generalDiscount: DISCOUNT,
    });
    expect(parsed.success).toBe(true);
  });

  it("borne les taux à ]0 ; 100 %[ et refuse la cible « produit »", () => {
    expect(generalDiscountSchema.safeParse({ ...DISCOUNT, baseBp: 10_000 }).success).toBe(false);
    expect(generalDiscountSchema.safeParse({ ...DISCOUNT, baseBp: 0 }).success).toBe(false);
    expect(
      generalDiscountSchema.safeParse({
        ...DISCOUNT,
        rules: [{ target: "product", targetId: "VIE-001", bp: 100 }],
      }).success,
    ).toBe(false);
  });

  it("l'avenant distingue l'arrêt (`set: null`) de l'absence", () => {
    const base = { reason: "Fin" };
    expect(amendCompanyMercurialePayloadSchema.parse(base).generalDiscount).toBeUndefined();
    expect(
      amendCompanyMercurialePayloadSchema.parse({ ...base, generalDiscount: { set: null } })
        .generalDiscount,
    ).toEqual({ set: null });
  });
});
