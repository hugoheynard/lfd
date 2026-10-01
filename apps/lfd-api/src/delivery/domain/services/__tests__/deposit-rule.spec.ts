import { depositPermitted } from "../deposit-rule.js";

describe("depositPermitted — « Déposé avec preuve » (AP-Q1, AP-Q6)", () => {
  it("permis quand le client l'autorise et qu'aucune signature n'est exigée", () => {
    expect(depositPermitted({ depositAllowed: true, signatureRequired: false })).toBe(true);
  });

  it("🔴 jamais quand une signature est exigée, même si l'adresse autorise le dépôt", () => {
    expect(depositPermitted({ depositAllowed: true, signatureRequired: true })).toBe(false);
  });

  it("jamais sans autorisation du client", () => {
    expect(depositPermitted({ depositAllowed: false, signatureRequired: false })).toBe(false);
    expect(depositPermitted({ depositAllowed: false, signatureRequired: true })).toBe(false);
  });
});
