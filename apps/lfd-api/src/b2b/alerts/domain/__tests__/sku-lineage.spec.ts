import { evaluatedSkusByReadSku, lineageNorms, lineageReadSkus } from "../sku-lineage.js";

describe("evaluatedSkusByReadSku", () => {
  it("un SKU sans lignée ne lit que lui-même", () => {
    expect(evaluatedSkusByReadSku(["A"], new Map())).toEqual(new Map([["A", ["A"]]]));
  });

  it("une ancienne référence compte pour le SKU qui en descend", () => {
    const owners = evaluatedSkusByReadSku(["NEW"], new Map([["NEW", ["MID", "OLD"]]]));

    expect(owners).toEqual(
      new Map([
        ["NEW", ["NEW"]],
        ["MID", ["NEW"]],
        ["OLD", ["NEW"]],
      ]),
    );
  });

  it("un ancêtre évalué lui-même dans le même panier compte pour les deux", () => {
    const owners = evaluatedSkusByReadSku(["OLD", "NEW"], new Map([["NEW", ["OLD"]]]));

    expect(owners.get("OLD")).toEqual(["OLD", "NEW"]);
  });
});

describe("lineageNorms — la norme catalogue remonte la lignée", () => {
  const norm = (sampleLines: number, medianQuantity = 4) => ({ sampleLines, medianQuantity });
  const LINEAGE = new Map([["NEW", ["MID", "OLD"]]]);

  it("une référence née sans norme prend celle de son ancêtre", () => {
    expect(lineageNorms(["NEW"], LINEAGE, new Map([["OLD", norm(30)]]))).toEqual(
      new Map([["NEW", norm(30)]]),
    );
  });

  it("la norme la mieux échantillonnée l'emporte, la sienne comprise", () => {
    const norms = new Map([
      ["NEW", norm(2, 9)],
      ["OLD", norm(30)],
    ]);

    expect(lineageNorms(["NEW"], LINEAGE, norms).get("NEW")).toEqual(norm(30));
  });

  it("la sienne reprend la main quand elle dépasse l'ancienne", () => {
    const norms = new Map([
      ["NEW", norm(40, 9)],
      ["OLD", norm(30)],
    ]);

    expect(lineageNorms(["NEW"], LINEAGE, norms).get("NEW")).toEqual(norm(40, 9));
  });

  it("à égalité, la plus proche l'emporte", () => {
    const norms = new Map([
      ["MID", norm(10, 6)],
      ["OLD", norm(10, 3)],
    ]);

    expect(lineageNorms(["NEW"], LINEAGE, norms).get("NEW")).toEqual(norm(10, 6));
  });

  it("sans norme dans toute la lignée, rien", () => {
    expect(lineageNorms(["NEW"], LINEAGE, new Map()).size).toBe(0);
  });

  it("lit le SKU puis ses ancêtres, sans doublon", () => {
    expect(lineageReadSkus(["NEW", "OLD"], LINEAGE)).toEqual(["NEW", "MID", "OLD"]);
  });
});
