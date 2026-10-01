import { depositPermitted } from "../deposit-rule.js";

const BY_CUSTOMER = { depositAuthorized: false } as const;

describe("depositPermitted — « Déposé avec preuve » (AP-Q1, AP-Q6, LB-Q5)", () => {
  it("permis quand le client l'autorise et qu'aucune signature n'est exigée", () => {
    expect(
      depositPermitted({ ...BY_CUSTOMER, depositAllowed: true, signatureRequired: false }),
    ).toBe(true);
  });

  it("🔴 jamais par le client seul quand une signature est exigée, même dépôt autorisé", () => {
    expect(
      depositPermitted({ ...BY_CUSTOMER, depositAllowed: true, signatureRequired: true }),
    ).toBe(false);
  });

  it("jamais sans autorisation du client ni du commercial", () => {
    expect(
      depositPermitted({ ...BY_CUSTOMER, depositAllowed: false, signatureRequired: false }),
    ).toBe(false);
    expect(
      depositPermitted({ ...BY_CUSTOMER, depositAllowed: false, signatureRequired: true }),
    ).toBe(false);
  });

  it("🔴 l'autorisation d'un commercial l'emporte, même signature exigée (LB-Q5)", () => {
    expect(
      depositPermitted({ depositAuthorized: true, depositAllowed: false, signatureRequired: true }),
    ).toBe(true);
    expect(
      depositPermitted({
        depositAuthorized: true,
        depositAllowed: false,
        signatureRequired: false,
      }),
    ).toBe(true);
  });
});
