import { minQuantitiesOf } from "../catalog-min-quantities-column.js";

/** La colonne `min_quantities` relue (`plan-quantite-minimale.md`, M2). */
describe("minQuantitiesOf", () => {
  it("relit la grille telle qu'écrite", () => {
    expect(minQuantitiesOf({ pro: { b2b: 6 }, public: { takeaway: 2 } })).toEqual({
      pro: { b2b: 6 },
      public: { takeaway: 2 },
    });
  });

  /** `NULL` = reçu avant le fil v15 : on ne sait pas, ce n'est pas « aucun minimum ». */
  it("rend `null` pour une ligne d'avant le fil", () => {
    expect(minQuantitiesOf(null)).toBeNull();
    expect(minQuantitiesOf([1, 2])).toBeNull();
  });

  it("écarte une case illisible sans perdre les autres", () => {
    expect(minQuantitiesOf({ pro: { b2b: 1, eatIn: "3", takeaway: 4 }, public: "rien" })).toEqual({
      pro: { takeaway: 4 },
      public: {},
    });
  });
});
