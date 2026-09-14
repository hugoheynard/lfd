import {
  exemptionLookupEmail,
  normalizeEmailForLookup,
  resolveFeatureLevel,
} from "../feature-level-resolution.js";
import { FeatureExemption } from "../feature-exemption.js";

const AUTHOR = { sub: "staff|1", name: "Camille Admin", role: "admin" };
const AT = new Date("2026-09-14T09:00:00.000Z");

describe("resolveFeatureLevel — l'ordre de la résolution", () => {
  it("rend le défaut du code quand rien n'est posé", () => {
    expect(resolveFeatureLevel("shop", { exempt: false, storedOverride: null })).toBe("order");
  });

  it("rend la dérogation quand elle est posée", () => {
    expect(resolveFeatureLevel("shop", { exempt: false, storedOverride: "closed" })).toBe("closed");
  });

  it("fait passer l'exemption AVANT la dérogation", () => {
    // La boutique est fermée pour tous, sauf pour le testeur.
    expect(resolveFeatureLevel("shop", { exempt: true, storedOverride: "closed" })).toBe("order");
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
    expect(resolveFeatureLevel("shop", { exempt: false, storedOverride: "maintenance" })).toBe(
      "order",
    );
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

describe("la normalisation, à l'écriture comme à la lecture", () => {
  it("écrit et cherche une adresse sous la MÊME forme", () => {
    // Deux normalisations écrites séparément finiraient par diverger, et
    // l'exemption cesserait de jouer pour une majuscule.
    const raw = "  Jeanne.Testeuse@Exemple.FR ";
    const written = FeatureExemption.grant({
      id: "ex_1",
      key: "shop",
      email: raw,
      at: AT,
      author: AUTHOR,
    }).email;

    expect(written).toBe("jeanne.testeuse@exemple.fr");
    expect(normalizeEmailForLookup(raw)).toBe(written);
  });
});
