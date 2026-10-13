import { siteIdOf } from "../pickup-site.parse.js";

const POSTAL = {
  label: "Le Labo",
  ligne1: "1 rue du Four",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

describe("siteIdOf — le site figé dans le snapshot du point (S2)", () => {
  it("rend l'id figé à la passation", () => {
    expect(siteIdOf({ ...POSTAL, siteId: "site_labo" })).toBe("site_labo");
  });

  it("rend `null` pour une commande d'avant le lot, sans rattrapage par libellé", () => {
    expect(siteIdOf(POSTAL)).toBeNull();
  });

  it("rend `null` sans snapshot (livraison)", () => {
    expect(siteIdOf(null)).toBeNull();
  });

  it("rend `null` pour un JSON d'une autre forme plutôt que de lever", () => {
    expect(siteIdOf({ siteId: "site_labo" })).toBeNull();
    expect(siteIdOf({ ...POSTAL, siteId: "" })).toBeNull();
  });
});
