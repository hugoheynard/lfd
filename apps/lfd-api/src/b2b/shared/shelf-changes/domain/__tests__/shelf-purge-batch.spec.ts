import { ShelfPurgeBatch } from "../shelf-purge-batch.js";
import {
  ALL_SHELVES,
  audienceShelves,
  companyShelves,
  targetedShelves,
} from "../shelf-change-scope.js";

/** Le regroupement d'une fenêtre (`le-rayon-en-cache.md`, C1). */
describe("ShelfPurgeBatch — ce qu'une fenêtre efface", () => {
  it("une fenêtre vide ne demande aucune purge", () => {
    const batch = new ShelfPurgeBatch();
    expect(batch.isEmpty()).toBe(true);
    expect(batch.order()).toBeNull();
  });

  it("des sociétés se regroupent, chacune une fois", () => {
    const batch = new ShelfPurgeBatch();
    batch.add(companyShelves("co_b"));
    batch.add(companyShelves("co_a"));
    batch.add(companyShelves("co_b"));
    expect(batch.order()).toEqual({ kind: "companies", companyIds: ["co_a", "co_b"] });
  });

  it("un « tout » absorbe les sociétés d'avant et d'après", () => {
    const batch = new ShelfPurgeBatch();
    batch.add(companyShelves("co_a"));
    batch.add(ALL_SHELVES);
    batch.add(companyShelves("co_b"));
    expect(batch.order()).toEqual({ kind: "all" });
  });
});

describe("La portée d'une décision", () => {
  it("une audience société efface la société ; un segment ou tous effacent tout", () => {
    expect(audienceShelves({ type: "company", id: "co_a" })).toEqual(companyShelves("co_a"));
    expect(audienceShelves({ type: "segment", id: "seg_1" })).toEqual(ALL_SHELVES);
    expect(audienceShelves({ type: "all", id: null })).toEqual(ALL_SHELVES);
  });

  it("des cibles toutes sociétés effacent chacune ; une cible large efface tout", () => {
    expect(targetedShelves(["co_a", "co_b", "co_a"])).toEqual([
      companyShelves("co_a"),
      companyShelves("co_b"),
    ]);
    expect(targetedShelves(["co_a", null])).toEqual([ALL_SHELVES]);
    expect(targetedShelves([])).toEqual([ALL_SHELVES]);
  });
});
