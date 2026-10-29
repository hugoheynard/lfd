import { SaleSkuAliases } from "../sale-sku-aliases.js";

describe("SaleSkuAliases — la canonicalisation d'une référence de vente", () => {
  const aliases = SaleSkuAliases.of([
    { aliasSku: "P-X", targetSku: "P-X-1" },
    { aliasSku: "P-X-OLD", targetSku: "P-X-1" },
  ]);

  it("lit un alias comme sa cible", () => {
    expect(aliases.canonical("P-X")).toBe("P-X-1");
  });

  it("lit une référence sans alias comme elle-même — la cible comme une autre", () => {
    expect(aliases.canonical("P-X-1")).toBe("P-X-1");
    expect(aliases.canonical("P-X-2")).toBe("P-X-2");
  });

  it("ne fusionne pas deux déclinaisons d'une même fiche", () => {
    expect(aliases.canonical("P-X-2")).not.toBe(aliases.canonical("P-X-1"));
  });

  it("rend toutes les graphies d'un article, qu'on le demande par sa cible ou par un alias", () => {
    expect(aliases.spellingsOf("P-X-1")).toEqual(["P-X-1", "P-X", "P-X-OLD"]);
    expect(aliases.spellingsOf("P-X")).toEqual(["P-X-1", "P-X", "P-X-OLD"]);
    expect(aliases.spellingsOf("P-Y")).toEqual(["P-Y"]);
  });

  it("rassemble les graphies de plusieurs références sans doublon", () => {
    expect(aliases.spellingsOfAll(["P-X", "P-X-1", "P-Y"])).toEqual([
      "P-X-1",
      "P-X",
      "P-X-OLD",
      "P-Y",
    ]);
  });

  it("sans alias, chaque référence se lit comme elle-même — la table vide du L1", () => {
    const none = SaleSkuAliases.none();
    expect(none.canonical("P-X")).toBe("P-X");
    expect(none.spellingsOf("P-X")).toEqual(["P-X"]);
  });
});
