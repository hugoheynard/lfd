import {
  BillingPayerNotFoundError,
  NotABillingPayerError,
} from "../../errors/billing-mode-errors.js";
import { requireBillingPayer } from "../billing-payer-guard.js";
import { paris } from "./billing-mode-fixtures.js";

const AT = paris("2026-10-08");
const SITE = { companyId: "site", name: "Site Annexe", follows: [] };
const follow = (validTo: Date | null) => ({
  companyId: "site",
  payerId: "group",
  payerName: "Groupe Payeur",
  validFrom: paris("2026-09-01"),
  validTo,
});

describe("requireBillingPayer — le mode ne se pose que sur un payeur (§16.6-5)", () => {
  it("un compte qui règle seul est un payeur", () => {
    expect(requireBillingPayer("site", SITE, AT)).toEqual({ id: "site", name: "Site Annexe" });
  });

  it("refuse un site facturé chez un autre, en nommant les deux", () => {
    const standing = { ...SITE, follows: [follow(null)] };
    expect(() => requireBillingPayer("site", standing, AT)).toThrow(NotABillingPayerError);
    expect(() => requireBillingPayer("site", standing, AT)).toThrow(
      /« Site Annexe » est facturé chez « Groupe Payeur »/u,
    );
  });

  it("un suivi `billing` terminé avant l'instant ne compte plus", () => {
    expect(
      requireBillingPayer("site", { ...SITE, follows: [follow(paris("2026-10-01"))] }, AT),
    ).toEqual({
      id: "site",
      name: "Site Annexe",
    });
  });

  it("refuse un compte inconnu", () => {
    expect(() => requireBillingPayer("ghost", null, AT)).toThrow(BillingPayerNotFoundError);
  });
});
