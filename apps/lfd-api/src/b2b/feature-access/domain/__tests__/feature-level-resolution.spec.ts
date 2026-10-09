import {
  exemptionLookupEmail,
  normalizeEmailForLookup,
  resolveFeatureLevel,
} from "../feature-level-resolution.js";

describe("resolveFeatureLevel — l'ordre de la résolution", () => {
  it("rend le défaut du code quand rien n'est posé", () => {
    expect(resolveFeatureLevel("customerMandate", { exempt: false, storedOverride: null })).toBe(
      "closed",
    );
  });

  it("rend la dérogation quand elle est posée", () => {
    expect(resolveFeatureLevel("customerMandate", { exempt: false, storedOverride: "open" })).toBe(
      "open",
    );
  });

  /**
   * Plan mandat client §9 #2 (2026-09-14) : une clé non exemptible ne s'ouvre
   * pas pour une personne, même si l'appelant se trompe et dit « exempté ».
   */
  it("n'ouvre pas une clé non exemptible, même à un exempté", () => {
    expect(resolveFeatureLevel("customerMandate", { exempt: true, storedOverride: null })).toBe(
      "closed",
    );
    expect(resolveFeatureLevel("customerMandate", { exempt: true, storedOverride: "open" })).toBe(
      "open",
    );
  });

  it("ignore une dérogation dont la valeur n'est plus un niveau de la clé", () => {
    // Deviner ce qu'un niveau disparu voulait dire ouvrirait ou fermerait la
    // vente sur une supposition : on retombe sur le défaut.
    expect(
      resolveFeatureLevel("customerMandate", { exempt: false, storedOverride: "maintenance" }),
    ).toBe("closed");
  });
});

describe("exemptionLookupEmail — seule une adresse prouvée se cherche", () => {
  it("ne cherche rien sans personne connectée", () => {
    expect(exemptionLookupEmail(null)).toBeNull();
  });

  it("ne cherche pas une adresse NON prouvée", () => {
    // Sinon, s'inscrire avec l'adresse d'un testeur suffirait à hériter de
    // son exemption.
    expect(exemptionLookupEmail({ email: "testeur@exemple.fr", emailProven: false })).toBeNull();
  });

  it("cherche une adresse prouvée, normalisée", () => {
    expect(exemptionLookupEmail({ email: "  Testeur@Exemple.FR ", emailProven: true })).toBe(
      "testeur@exemple.fr",
    );
  });

  it("ne cherche pas une adresse vide, même prouvée", () => {
    expect(exemptionLookupEmail({ email: "   ", emailProven: true })).toBeNull();
  });
});

describe("la normalisation de la recherche", () => {
  it("cherche une adresse sans espaces, en minuscules", () => {
    expect(normalizeEmailForLookup("  Jeanne.Testeuse@Exemple.FR ")).toBe(
      "jeanne.testeuse@exemple.fr",
    );
  });
});
