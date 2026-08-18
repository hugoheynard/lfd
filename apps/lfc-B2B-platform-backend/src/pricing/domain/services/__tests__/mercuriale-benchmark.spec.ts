import { benchmarkByProduct } from "../mercuriale-benchmark.js";
import type { NegotiatedPrice } from "../mercuriale-benchmark.js";

const at = (companyId: string, unitPriceCents: number, sku = "baguette"): NegotiatedPrice => ({
  sku,
  companyId,
  unitPriceCents,
});

describe("benchmarkByProduct", () => {
  it("rend la médiane, les bornes et le nombre de clients", () => {
    const [entry] = benchmarkByProduct([at("a", 100), at("b", 120), at("c", 160)]);
    expect(entry).toEqual({
      sku: "baguette",
      medianCents: 120,
      lowCents: 100,
      highCents: 160,
      companyCount: 3,
    });
  });

  it("moyenne les deux du milieu sur un nombre pair", () => {
    const [entry] = benchmarkByProduct([at("a", 100), at("b", 110), at("c", 130), at("d", 150)]);
    expect(entry?.medianCents).toBe(120);
  });

  it("encaisse un contrat exceptionnel bien mieux que la moyenne — c'est POURQUOI", () => {
    const prices = [100, 110, 120, 20];
    const entry = benchmarkByProduct([at("a", 100), at("b", 110), at("c", 120), at("d", 20)])[0];
    const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    // 1,05 € contre 0,87 € : le prix arraché au premier client ne doit pas faire
    // passer un tarif normal pour une largesse.
    expect(entry?.medianCents).toBe(105);
    expect(entry?.medianCents ?? 0).toBeGreaterThan(mean);
  });

  it("compte UN client une fois, même avec trois paliers", () => {
    const entry = benchmarkByProduct([at("a", 120), at("a", 100), at("a", 80), at("b", 200)])[0];
    expect(entry?.companyCount).toBe(2);
    // Le prix retenu est celui du plus petit seuil, donc le plus haut des trois.
    expect(entry?.lowCents).toBe(120);
  });

  it("sépare les articles", () => {
    const entries = benchmarkByProduct([at("a", 100), at("a", 300, "croissant")]);
    expect(entries).toHaveLength(2);
  });

  it("rend une liste vide sans observation", () => {
    expect(benchmarkByProduct([])).toEqual([]);
  });
});
