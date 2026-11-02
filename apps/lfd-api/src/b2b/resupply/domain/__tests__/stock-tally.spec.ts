import { StockTallies, stockKeyOf } from "../stock-tally.js";

interface Counted {
  readonly sku: string;
  readonly saleUnit: "piece" | "weight";
  readonly label: string;
  count: number;
}

function tallies(): StockTallies<Counted> {
  return new StockTallies<Counted>((identity) => ({ ...identity, count: 0 }));
}

describe("StockTallies — le compte commun par (article, unité)", () => {
  it("additionne un même article dans la même unité, au libellé de sa première apparition", () => {
    const counts = tallies();
    counts.of({ sku: "CRO", saleUnit: "piece", label: "Croissant" }).count += 2;
    counts.of({ sku: "CRO", saleUnit: "piece", label: "Croissant renommé" }).count += 3;

    expect(counts.values()).toEqual([
      { sku: "CRO", saleUnit: "piece", label: "Croissant", count: 5 },
    ]);
  });

  it("ne somme jamais pièces et grammes : deux comptes, dans l'ordre d'apparition", () => {
    const counts = tallies();
    counts.of({ sku: "PAIN", saleUnit: "weight", label: "Pain" }).count += 500;
    counts.of({ sku: "PAIN", saleUnit: "piece", label: "Pain" }).count += 1;

    expect(counts.values().map((tally) => [tally.saleUnit, tally.count])).toEqual([
      ["weight", 500],
      ["piece", 1],
    ]);
  });

  it("la clé nomme l'unité et l'article", () => {
    expect(stockKeyOf("CRO", "weight")).not.toBe(stockKeyOf("CRO", "piece"));
  });
});

describe("StockTallies — l'identité seule ouvre un compte", () => {
  it("ne recopie pas les autres champs de la ligne qui ouvre le compte", () => {
    const counts = tallies();
    const line = { sku: "CRO", saleUnit: "piece" as const, label: "Croissant", quantity: 7 };

    counts.of(line).count += line.quantity;

    expect(counts.values()).toEqual([
      { sku: "CRO", saleUnit: "piece", label: "Croissant", count: 7 },
    ]);
  });
});
