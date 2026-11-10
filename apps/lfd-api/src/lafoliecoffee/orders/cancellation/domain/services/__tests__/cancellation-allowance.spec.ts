import { BEFORE_INSCRIPTION, cancellationAllowanceOf } from "../cancellation-allowance.js";

/** L'autorisation du plan A1 (C7 § 4) : personnelle ET réglage `ready`, sinon la règle d'avant. */
describe("cancellationAllowanceOf", () => {
  it("commande personnelle, étape ready → jusqu'au colisage", () => {
    expect(cancellationAllowanceOf(null, "ready")).toEqual({ allowance: "before_packing" });
  });

  it.each([
    ["personnelle, arrêt du plan", null, "production_plan"],
    ["de société, étape ready", "co_1", "ready"],
    ["de société, arrêt du plan", "co_1", "production_plan"],
  ] as const)("%s → avant l'inscription", (_, companyId, stage) => {
    expect(cancellationAllowanceOf(companyId, stage)).toEqual(BEFORE_INSCRIPTION);
  });
});
