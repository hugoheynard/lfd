import type { CatalogFamilyView } from "@lfd/contracts";

import { article } from "../../__tests__/placement-doubles.js";
import { groupingEntriesOf } from "../grouping-entries.js";

const SALTY = { id: "fam-salty", name: "Traiteur salé", position: 1 };
const BREADS: CatalogFamilyView = { id: "fam-bread", name: "Pains", position: 0 };
const QUICHES: CatalogFamilyView = { id: "fam-quiche", name: "Quiches", position: 1, root: SALTY };
const SALTY_ROOT: CatalogFamilyView = { ...SALTY };

const SHELVES = new Map<string, CatalogFamilyView>([
  ["QUI-8", QUICHES],
  ["CAKE-1", SALTY_ROOT],
  ["BAG-1", BREADS],
]);

const PLACEMENT = {
  workstations: [{ id: "ws-pat", name: "Pâtisserie" }],
  articles: new Map([
    ["QUI-8", article("QUI-8", "QUI", QUICHES)],
    ["CAKE-1", article("CAKE-1", "CAKE", SALTY_ROOT)],
    ["BAG-1", article("BAG-1", "BAG", BREADS)],
  ]),
  byProduct: finishingAt([["QUI", "ws-pat"]]),
};

describe("groupingEntriesOf — mode boutique", () => {
  it("range par rayon racine, dans l'ordre du référentiel, puis « Hors catalogue »", () => {
    const entries = groupingEntriesOf(
      ["QUI-8", "GHOST", "BAG-1", "CAKE-1"],
      { mode: "shelf", shelves: SHELVES },
      false,
    );

    expect(
      entries.map(({ sku, key, title, kind, order, section }) => [
        sku,
        key,
        title,
        kind,
        order,
        section,
      ]),
    ).toEqual([
      ["BAG-1", "fam-bread", "Pains", "shelf", 0, null],
      ["QUI-8", "fam-salty", "Traiteur salé", "shelf", 1, null],
      ["CAKE-1", "fam-salty", "Traiteur salé", "shelf", 1, null],
      ["GHOST", "?", "Hors catalogue", "off_catalog", 2, null],
    ]);
  });

  it("pose l'intertitre de chaque SKU quand le réglage affiche les sous-catégories", () => {
    const entries = groupingEntriesOf(
      ["QUI-8", "CAKE-1"],
      { mode: "shelf", shelves: SHELVES },
      true,
    );

    expect(entries.map((entry) => [entry.sku, entry.section])).toEqual([
      ["CAKE-1", { key: null, label: null, order: 0 }],
      ["QUI-8", { key: "fam-quiche", label: "Quiches", order: 1 }],
    ]);
  });

  it("dit « Rayon inconnu » quand les rayons n'ont pas pu être lus", () => {
    const entries = groupingEntriesOf(["QUI-8"], { mode: "shelf", shelves: null }, true);

    expect(entries).toEqual([
      {
        sku: "QUI-8",
        key: "?",
        title: "Rayon inconnu",
        kind: "off_catalog",
        order: 0,
        section: null,
        role: null,
      },
    ]);
  });
});

describe("groupingEntriesOf — mode prod", () => {
  it("range par poste, puis les rayons « à ranger », puis le hors catalogue « à ranger »", () => {
    const entries = groupingEntriesOf(
      ["BAG-1", "QUI-8", "GHOST"],
      { mode: "workstation", placement: PLACEMENT },
      false,
    );

    expect(
      entries.map(({ sku, key, title, kind, order }) => [sku, key, title, kind, order]),
    ).toEqual([
      ["QUI-8", "ws:ws-pat", "Pâtisserie", "workstation", 0],
      ["BAG-1", "fam-bread", "Pains — à ranger", "unplaced", 1],
      ["GHOST", "?", "Hors catalogue — à ranger", "off_catalog", 2],
    ]);
  });

  it("ne donne pas d'intertitre de boutique à un poste", () => {
    const entries = groupingEntriesOf(
      ["QUI-8"],
      { mode: "workstation", placement: PLACEMENT },
      true,
    );

    expect(entries[0]?.section).toEqual({ key: null, label: null, order: 0 });
  });

  it("rend chaque SKU d'un seul poste exactement une fois", () => {
    const skus = ["BAG-1", "QUI-8", "GHOST", "CAKE-1"];
    for (const showSubcategories of [false, true]) {
      const entries = groupingEntriesOf(
        skus,
        { mode: "workstation", placement: PLACEMENT },
        showSubcategories,
      );
      expect(entries.map((entry) => entry.sku).sort()).toEqual([...skus].sort());
    }
  });
});

describe("groupingEntriesOf — un produit sur plusieurs postes", () => {
  const TWO_STATIONS = {
    ...PLACEMENT,
    workstations: [
      { id: "ws-bread", name: "Boulangerie" },
      { id: "ws-pat", name: "Pâtisserie" },
    ],
    byProduct: new Map([
      [
        "QUI",
        [
          { workstationId: "ws-pat", finishes: true, position: null },
          { workstationId: "ws-bread", finishes: false, position: null },
        ],
      ],
    ]),
  };

  it("rend une entrée par poste, avec le rôle du SKU dans chacun", () => {
    for (const showSubcategories of [false, true]) {
      const entries = groupingEntriesOf(
        ["QUI-8"],
        { mode: "workstation", placement: TWO_STATIONS },
        showSubcategories,
      );

      expect(entries.map(({ sku, key, order, role }) => [sku, key, order, role])).toEqual([
        ["QUI-8", "ws:ws-bread", 0, "step"],
        ["QUI-8", "ws:ws-pat", 1, "finishes"],
      ]);
    }
  });

  it("le mode boutique la rend une fois, sans rôle", () => {
    const entries = groupingEntriesOf(["QUI-8"], { mode: "shelf", shelves: SHELVES }, false);

    expect(entries.map(({ sku, role }) => [sku, role])).toEqual([["QUI-8", null]]);
  });
});

/** Chaque produit sur un seul poste, qui le finit, sans place réglée. */
function finishingAt(
  pairs: readonly (readonly [string, string])[],
): ReadonlyMap<string, readonly { workstationId: string; finishes: boolean; position: null }[]> {
  return new Map(
    pairs.map(([product, workstationId]) => [
      product,
      [{ workstationId, finishes: true, position: null }],
    ]),
  );
}
