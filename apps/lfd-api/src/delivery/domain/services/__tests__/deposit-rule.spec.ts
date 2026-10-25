import { depositPermitted } from "../deposit-rule.js";

describe("depositPermitted — « Déposé avec preuve » (AP-Q6, LB-Q5, « dépôt A » du 2026-10-25)", () => {
  /** Hugo, 2026-10-25 : le « dépôt autorisé » du client n'est plus exigé. */
  it("permis dès qu'aucune signature n'est exigée", () => {
    expect(depositPermitted({ depositAuthorized: false, signatureRequired: false })).toBe(true);
  });

  it("🔴 jamais par le livreur seul quand une signature est exigée (AP-Q6)", () => {
    expect(depositPermitted({ depositAuthorized: false, signatureRequired: true })).toBe(false);
  });

  it("🔴 l'autorisation d'un commercial l'emporte, même signature exigée (LB-Q5)", () => {
    expect(depositPermitted({ depositAuthorized: true, signatureRequired: true })).toBe(true);
    expect(depositPermitted({ depositAuthorized: true, signatureRequired: false })).toBe(true);
  });
});
