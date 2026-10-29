import { minQuantityFor } from "../catalog-min-quantities.js";

/** Le minimum de qui regarde (`plan-quantite-minimale.md`, M2, Q7). */
describe("minQuantityFor", () => {
  const grid = { pro: { b2b: 6, takeaway: 9 }, public: { takeaway: 2, b2b: 7 } };

  it("lit la case du public dans le contexte de la boutique publique", () => {
    expect(minQuantityFor(grid, "public")).toBe(2);
  });

  it("lit la case du pro dans le contexte b2b", () => {
    expect(minQuantityFor(grid, "pro")).toBe(6);
  });

  it("rend `null` sans case, et pour un article reçu avant le fil v15", () => {
    expect(minQuantityFor({ pro: {}, public: { eatIn: 4 } }, "public")).toBeNull();
    expect(minQuantityFor(null, "pro")).toBeNull();
  });
});
