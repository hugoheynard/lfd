import { NO_CATALOG_MIN_QUANTITIES, minQuantityFor } from "../catalog-min-quantities.js";

/** Le minimum de qui regarde (`plan-quantite-minimale.md`, M2) : par audience seulement. */
describe("minQuantityFor", () => {
  const minimums = { pro: 6, public: 2 };

  it("lit le minimum du public", () => {
    expect(minQuantityFor(minimums, "public")).toBe(2);
  });

  it("lit le minimum du pro", () => {
    expect(minQuantityFor(minimums, "pro")).toBe(6);
  });

  it("rend `null` quand la clientèle n'a pas de minimum", () => {
    expect(minQuantityFor({ pro: null, public: 4 }, "pro")).toBeNull();
    expect(minQuantityFor(NO_CATALOG_MIN_QUANTITIES, "public")).toBeNull();
  });
});
