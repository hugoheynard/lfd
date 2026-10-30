import { evaluatedSkusByReadSku } from "../sku-lineage.js";

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
