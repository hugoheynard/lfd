import { BillingPayerNotFoundError } from "../../errors/billing-mode-errors.js";
import { NotACollectionMeansPayerError } from "../../errors/collection-means-errors.js";
import { collectionMeansPayerOf, requireCollectionMeansPayer } from "../collection-means-payer.js";
import { paris } from "./billing-mode-fixtures.js";

const AT = paris("2026-10-08");
const ALONE = { companyId: "cmp_a", name: "Seul SAS", active: true, follows: [] };
const FOLLOW = {
  companyId: "cmp_site",
  payerId: "cmp_group",
  payerName: "Groupe Payeur",
  validFrom: paris("2026-09-01"),
  validTo: null,
};
const SITE = { companyId: "cmp_site", name: "Site Annexe", active: true, follows: [FOLLOW] };

describe("le payeur qui porte le moyen (V1)", () => {
  it("un compte qui règle seul porte son moyen", () => {
    expect(collectionMeansPayerOf(ALONE, AT)).toEqual({
      payer: { id: "cmp_a", name: "Seul SAS" },
      followed: false,
    });
    expect(requireCollectionMeansPayer("cmp_a", ALONE, AT)).toEqual({
      id: "cmp_a",
      name: "Seul SAS",
    });
  });

  it("un site qui suit la facturation de son principal prend le moyen du principal", () => {
    expect(collectionMeansPayerOf(SITE, AT)).toEqual({
      payer: { id: "cmp_group", name: "Groupe Payeur" },
      followed: true,
    });
  });

  it("refuse de changer le moyen d'un site suivi, en nommant les deux", () => {
    const attempt = (): unknown => requireCollectionMeansPayer("cmp_site", SITE, AT);
    expect(attempt).toThrow(NotACollectionMeansPayerError);
    expect(attempt).toThrow(/« Site Annexe ».*« Groupe Payeur »/su);
  });

  it("un site dont le suivi a pris fin règle seul", () => {
    const ended = { ...SITE, follows: [{ ...FOLLOW, validTo: paris("2026-10-01") }] };
    expect(collectionMeansPayerOf(ended, AT).followed).toBe(false);
  });

  it("un compte inconnu est refusé", () => {
    expect(() => requireCollectionMeansPayer("x", null, AT)).toThrow(BillingPayerNotFoundError);
  });
});
