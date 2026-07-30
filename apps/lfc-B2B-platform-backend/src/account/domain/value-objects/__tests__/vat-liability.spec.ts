import { requiresVatNumber } from "../vat-liability.js";

describe("requiresVatNumber — TVA dérivée de la forme juridique", () => {
  it("les sociétés sont assujetties", () => {
    for (const forme of ["SAS", "SARL", "SA", "SASU", "EURL", "SCI", "société"]) {
      expect(requiresVatNumber(forme)).toBe(true);
    }
  });

  it("EI / micro / auto-entrepreneur ne le sont pas (franchise en base)", () => {
    for (const forme of [
      "EI",
      "micro",
      "micro-entreprise",
      "auto-entrepreneur",
      "auto entrepreneur",
      "entreprise individuelle",
    ]) {
      expect(requiresVatNumber(forme)).toBe(false);
    }
  });

  it("insensible à la casse et aux espaces superflus", () => {
    expect(requiresVatNumber("  Micro-Entreprise  ")).toBe(false);
    expect(requiresVatNumber("sas")).toBe(true);
  });

  it("forme inconnue ou vide ⇒ assujettie (on invite plutôt qu'on masque)", () => {
    expect(requiresVatNumber("")).toBe(true);
    expect(requiresVatNumber("forme exotique")).toBe(true);
  });
});
