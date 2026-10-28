import { floorCounts } from "../production-count.js";

/** Le plancher du compte d'après l'arrêt (plan A2, § 7, B3) — pur. */

const item = (sku: string, quantity: number, productName = `Article ${sku}`) => ({
  sku,
  productName,
  quantity,
  saleUnit: "piece" as const,
  done: null,
});

describe("floorCounts", () => {
  it("garde, par article, le plus grand du compte précédent et du compte refait", () => {
    expect(floorCounts([item("A", 10), item("B", 4)], [item("A", 7), item("B", 6)])).toEqual([
      item("A", 10),
      item("B", 6),
    ]);
  });

  it("garde un article que le compte refait ne connaît plus", () => {
    expect(floorCounts([item("A", 10)], [item("B", 2)])).toEqual([item("A", 10), item("B", 2)]);
  });

  it("trie par SKU et efface toute coche héritée", () => {
    const marked = { ...item("B", 3), done: { at: new Date(0), by: "s", initials: "" } };

    expect(floorCounts([marked], [item("A", 1)])).toEqual([item("A", 1), item("B", 3)]);
  });

  it("prend le nom du compte refait quand il connaît l'article", () => {
    expect(floorCounts([item("A", 1, "Ancien")], [item("A", 2, "Nouveau")])).toEqual([
      item("A", 2, "Nouveau"),
    ]);
  });
});
