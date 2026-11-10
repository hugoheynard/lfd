import { SalesTermsOutdatedError } from "../../errors/sales-terms-outdated.error.js";
import { ensureSalesTermsAccepted } from "../sales-terms-acceptance.js";

describe("ensureSalesTermsAccepted", () => {
  it("admet le texte et la révision en vigueur", () => {
    expect(() =>
      ensureSalesTermsAccepted({ key: "salesTermsPro", revision: 4 }, "salesTermsPro", 4),
    ).not.toThrow();
  });

  it("admet `null` quand rien n'est publié : il n'y avait rien à cocher", () => {
    expect(() => ensureSalesTermsAccepted(null, "salesTermsPro", null)).not.toThrow();
  });

  it.each([
    ["une révision plus ancienne", { key: "salesTerms" as const, revision: 3 }, "salesTerms", 4],
    [
      "le texte de l'autre audience",
      { key: "salesTerms" as const, revision: 4 },
      "salesTermsPro",
      4,
    ],
    ["rien coché alors qu'un texte est en vigueur", null, "salesTerms", 1],
    [
      "une version alors que rien n'est publié",
      { key: "salesTerms" as const, revision: 1 },
      "salesTerms",
      null,
    ],
  ] as const)("refuse %s", (_, accepted, document, revision) => {
    expect(() => ensureSalesTermsAccepted(accepted, document, revision)).toThrow(
      SalesTermsOutdatedError,
    );
  });
});
