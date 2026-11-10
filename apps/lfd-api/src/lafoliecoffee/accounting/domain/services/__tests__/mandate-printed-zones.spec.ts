import { MandateDefaults } from "../../value-objects/mandate-defaults.js";
import { defaultsChangeReprintsDraft, printsOptionalZones } from "../mandate-printed-zones.js";

/**
 * Ce que chaque formulaire imprime des réglages — la règle qui décide si un
 * brouillon devient caduc (plan mandat deux schémas §10.4, Q2).
 */
describe("printsOptionalZones", () => {
  it("le CORE imprime les zones 14, 19 et 20", () => {
    expect(printsOptionalZones("CORE")).toBe(true);
  });

  it("l'interentreprises ne les imprime pas — le gabarit DGFiP n'en a pas", () => {
    expect(printsOptionalZones("B2B")).toBe(false);
  });
});

describe("defaultsChangeReprintsDraft", () => {
  const recurrent = MandateDefaults.create("Fourniture de viennoiseries", "recurrent");

  it.each(["CORE", "B2B"] as const)("un type de paiement changé réimprime sous %s", (scheme) => {
    const oneOff = MandateDefaults.create("Fourniture de viennoiseries", "one_off");

    expect(defaultsChangeReprintsDraft(recurrent, oneOff, scheme)).toBe(true);
  });

  it("une description changée réimprime sous CORE", () => {
    const next = MandateDefaults.create("Fourniture de pains", "recurrent");

    expect(defaultsChangeReprintsDraft(recurrent, next, "CORE")).toBe(true);
  });

  it("une description changée ne réimprime RIEN sous interentreprises", () => {
    const next = MandateDefaults.create("Fourniture de pains", "recurrent");

    expect(defaultsChangeReprintsDraft(recurrent, next, "B2B")).toBe(false);
  });

  it("une réécriture à l'identique, espaces compris, ne réimprime rien", () => {
    const same = MandateDefaults.create("  Fourniture de viennoiseries ", "recurrent");

    expect(defaultsChangeReprintsDraft(recurrent, same, "CORE")).toBe(false);
  });
});
