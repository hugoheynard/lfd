import { describeGeneralDiscount } from "../general-discount-summary.js";

describe("describeGeneralDiscount", () => {
  it("dit l'absence de remise", () => {
    expect(describeGeneralDiscount(null)).toBe("sans remise générale");
  });

  it("« tout sauf » : le taux de base, les taux particuliers, les exclusions comptées", () => {
    expect(
      describeGeneralDiscount({
        mode: "all_except",
        baseBp: 3_000,
        rules: [
          { target: "category", targetId: "cat_pains", bp: 4_000 },
          { target: "category", targetId: "cat_choc", bp: null },
          { target: "variant", targetId: "VIE-001", bp: null },
          { target: "variant", targetId: "VIE-002", bp: null },
        ],
      }),
    ).toBe("remise générale −30 %, 1 taux particulier, sauf 1 famille et 2 articles");
  });

  it("« tout sauf » sans ligne : le taux seul, décimales à la française", () => {
    expect(describeGeneralDiscount({ mode: "all_except", baseBp: 1_250, rules: [] })).toBe(
      "remise générale −12,5 %",
    );
  });

  it("« seulement » : les cibles et l'étendue des taux", () => {
    expect(
      describeGeneralDiscount({
        mode: "only",
        baseBp: null,
        rules: [
          { target: "category", targetId: "cat_pains", bp: 4_000 },
          { target: "category", targetId: "cat_vienno", bp: 2_500 },
          { target: "variant", targetId: "PAI-001-1", bp: null },
        ],
      }),
    ).toBe("remise générale sur 2 familles seulement (−25 % à −40 %), sauf 1 article");
  });
});
