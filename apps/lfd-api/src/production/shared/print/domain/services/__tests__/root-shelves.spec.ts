import type { CatalogFamilyView } from "@lfd/contracts";

import { rootOf, rootShelvesOf, sectionOrdered } from "../root-shelves.js";

/** Le rangement par racine, en fonction pure — ni Nest, ni double. */
const VIEN = { id: "fam-vien", name: "Viennoiserie", position: 1 };
const PAINS: CatalogFamilyView = { id: "fam-pain", name: "Pains", position: 0 };
const FINE: CatalogFamilyView = {
  id: "fam-fine",
  name: "Viennoiserie fine",
  position: 5,
  root: VIEN,
};
const BRIOCHE: CatalogFamilyView = { id: "fam-brio", name: "Brioches", position: 5, root: VIEN };

const FAMILIES = new Map<string, CatalogFamilyView>([
  ["fine", FINE],
  ["brio", BRIOCHE],
  ["vien", { ...VIEN, root: VIEN }],
  ["bread", PAINS],
]);

describe("rootShelvesOf", () => {
  it("regroupe par racine, racines par position puis nom", () => {
    const { shelves, unshelved } = rootShelvesOf(["fine", "bread", "vien", "brio"], (sku) =>
      FAMILIES.get(sku),
    );

    expect(shelves.map((shelf) => shelf.root.id)).toEqual(["fam-pain", "fam-vien"]);
    expect(shelves[1]?.items).toEqual(["fine", "vien", "brio"]);
    expect(unshelved).toEqual([]);
  });

  it("range les sections : la racine en tête, puis position puis nom", () => {
    const { shelves } = rootShelvesOf(["fine", "vien", "brio"], (sku) => FAMILIES.get(sku));

    expect(shelves[0]?.sections.map((section) => section.family?.name ?? null)).toEqual([
      null,
      "Brioches",
      "Viennoiserie fine",
    ]);
  });

  it("un article sans famille connue ne tombe dans aucun groupe", () => {
    const { shelves, unshelved } = rootShelvesOf(["xxx", "bread"], (sku) => FAMILIES.get(sku));

    expect(shelves.map((shelf) => shelf.root.id)).toEqual(["fam-pain"]);
    expect(unshelved).toEqual(["xxx"]);
  });

  it("une famille servie sans racine est sa propre racine", () => {
    expect(rootOf(PAINS)).toEqual({ id: "fam-pain", name: "Pains", position: 0 });
  });

  it("ordonne les articles section par section, chacune par le comparateur", () => {
    const { shelves } = rootShelvesOf(["fine", "vien", "brio", "fine2"], (sku) =>
      FAMILIES.get(sku === "fine2" ? "fine" : sku),
    );

    expect(sectionOrdered(shelves[0]?.sections ?? [], (a, b) => b.localeCompare(a))).toEqual([
      "vien",
      "brio",
      "fine2",
      "fine",
    ]);
  });
});
