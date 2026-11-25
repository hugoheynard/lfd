import {
  SHELF_LABEL_OFF_CATALOG,
  SHELF_LABEL_UNKNOWN,
  UNSHELVED_WORKSHOP_GROUP_KEY,
  type CatalogFamilyView,
} from "@lfd/contracts";

import {
  type GroupingArticle,
  type GroupingPlacement,
  type GroupingStation,
  type ProductionGroup,
  groupingOf,
} from "../production-grouping.js";
import { rootShelvesOf } from "../root-shelves.js";

/**
 * **Le rangement du fournil, dans ses deux modes** (plan
 * `documentation/fournil/les-postes-du-fournil.md`, § 3.4), en fonction pure.
 */
const SALTY = { id: "fam-salty", name: "Traiteur salé", position: 2 };
const BREADS: CatalogFamilyView = { id: "fam-bread", name: "Pains", position: 0 };
const PASTRY: CatalogFamilyView = { id: "fam-pastry", name: "Pâtisserie", position: 1 };
const QUICHES: CatalogFamilyView = { id: "fam-quiche", name: "Quiches", position: 1, root: SALTY };
const SALTY_ROOT: CatalogFamilyView = { ...SALTY, root: SALTY };

const SHELVES = new Map<string, CatalogFamilyView>([
  ["QUI-6", QUICHES],
  ["QUI-8", QUICHES],
  ["CAK-1", SALTY_ROOT],
  ["BAG-1", BREADS],
  ["TAR-1", PASTRY],
]);

const ARTICLES = new Map<string, GroupingArticle>([
  ["QUI-6", { productSku: "QUI", family: QUICHES }],
  ["QUI-8", { productSku: "QUI", family: QUICHES }],
  ["CAK-1", { productSku: "CAK", family: SALTY_ROOT }],
  ["BAG-1", { productSku: "BAG", family: BREADS }],
  ["TAR-1", { productSku: "TAR", family: PASTRY }],
]);

const WORKSTATIONS = [
  { id: "ws_bakery", name: "Boulangerie" },
  { id: "ws_pastry", name: "Pâtisserie" },
];

/** Chaque produit sur un seul poste, qui le finit ; sa place dans la pile s'il en a une. */
function placement(
  byProduct: readonly (readonly [string, string])[],
  positions: readonly (readonly [string, number])[] = [],
): GroupingPlacement {
  const placeOf = new Map(positions);
  return {
    workstations: WORKSTATIONS,
    articles: ARTICLES,
    byProduct: new Map(
      byProduct.map(([product, workstationId]) => [
        product,
        [{ workstationId, finishes: true, position: placeOf.get(product) ?? null }],
      ]),
    ),
  };
}

const LINES = ["TAR-1", "QUI-8", "BAG-1", "XXX-1", "QUI-6", "CAK-1"];
const sku = (line: string): string => line;

function linesOf(groups: readonly ProductionGroup<string>[]): readonly string[] {
  return groups.flatMap((group) => group.lines);
}

describe("groupingOf — mode boutique", () => {
  it("est exactement le rangement par rayon racine, puis « Hors catalogue »", () => {
    const groups = groupingOf(LINES, sku, { mode: "shelf", shelves: SHELVES });
    const reference = rootShelvesOf(LINES, (line) => SHELVES.get(line));

    expect(groups.slice(0, -1)).toEqual(
      reference.shelves.map((shelf) => ({
        key: shelf.root.id,
        title: shelf.root.name,
        kind: "shelf",
        workstation: null,
        shelf: shelf.root,
        unplaced: false,
        sections: shelf.sections,
        lines: shelf.items,
        roles: new Map(),
      })),
    );
    expect(groups.at(-1)).toEqual({
      key: UNSHELVED_WORKSHOP_GROUP_KEY,
      title: SHELF_LABEL_OFF_CATALOG,
      kind: "off_catalog",
      workstation: null,
      shelf: null,
      unplaced: false,
      sections: [],
      lines: reference.unshelved,
      roles: new Map(),
    });
  });

  it("des rayons illisibles rangent tout en « Rayon inconnu »", () => {
    const groups = groupingOf(LINES, sku, { mode: "shelf", shelves: null });

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ title: SHELF_LABEL_UNKNOWN, lines: LINES, unplaced: false });
  });
});

describe("groupingOf — mode prod", () => {
  it("les postes dans leur ordre, puis les rayons « à ranger », puis le hors catalogue", () => {
    const groups = groupingOf(LINES, sku, {
      mode: "workstation",
      placement: placement([
        ["QUI", "ws_pastry"],
        ["TAR", "ws_pastry"],
        ["BAG", "ws_bakery"],
      ]),
    });

    expect(groups.map((group) => [group.key, group.title, group.kind, group.unplaced])).toEqual([
      ["ws:ws_bakery", "Boulangerie", "workstation", false],
      ["ws:ws_pastry", "Pâtisserie", "workstation", false],
      ["fam-salty", "Traiteur salé — à ranger", "unplaced", true],
      [UNSHELVED_WORKSHOP_GROUP_KEY, `${SHELF_LABEL_OFF_CATALOG} — à ranger`, "off_catalog", true],
    ]);
    expect(groups[1]?.workstation).toEqual({ id: "ws_pastry", name: "Pâtisserie" });
    // Les déclinaisons d'un produit suivent son poste, dans l'ordre reçu.
    expect(groups[1]?.lines).toEqual(["TAR-1", "QUI-8", "QUI-6"]);
    expect(groups[2]?.lines).toEqual(["CAK-1"]);
    expect(groups[3]?.lines).toEqual(["XXX-1"]);
  });

  /** Décidé par Hugo le 2026-11-17 : un poste parle la langue du fournil, sans rayon de boutique. */
  it("un poste n'a pas d'intertitre de boutique : une seule section, la racine", () => {
    const groups = groupingOf(LINES, sku, {
      mode: "workstation",
      placement: placement([
        ["QUI", "ws_pastry"],
        ["TAR", "ws_pastry"],
        ["CAK", "ws_pastry"],
      ]),
    });
    const pastry = groups.find((group) => group.key === "ws:ws_pastry");

    expect(
      pastry?.sections.map((section) => [section.family?.name ?? null, section.items]),
    ).toEqual([[null, pastry?.lines]]);
  });

  it("un poste sans ligne n'a pas de groupe", () => {
    const groups = groupingOf(["BAG-1"], sku, {
      mode: "workstation",
      placement: placement([["BAG", "ws_bakery"]]),
    });

    expect(groups.map((group) => group.key)).toEqual(["ws:ws_bakery"]);
  });

  it("aucun produit placé : rangé comme en mode boutique, chaque groupe « à ranger »", () => {
    const groups = groupingOf(LINES, sku, { mode: "workstation", placement: placement([]) });
    const shelf = groupingOf(LINES, sku, { mode: "shelf", shelves: SHELVES });

    expect(groups.map((group) => group.key)).toEqual(shelf.map((group) => group.key));
    expect(groups.map((group) => group.lines)).toEqual(shelf.map((group) => group.lines));
    expect(groups.every((group) => group.unplaced)).toBe(true);
  });

  it("un produit placé sur un poste absent de la liste reste « à ranger »", () => {
    const groups = groupingOf(["BAG-1"], sku, {
      mode: "workstation",
      placement: placement([["BAG", "ws_gone"]]),
    });

    expect(groups).toMatchObject([{ key: "fam-bread", kind: "unplaced" }]);
  });

  it("chaque rayon a un poste du même nom : mêmes titres et mêmes lignes qu'en mode boutique", () => {
    const sameNames: GroupingPlacement = {
      workstations: [
        { id: "ws_b", name: "Pains" },
        { id: "ws_p", name: "Pâtisserie" },
        { id: "ws_s", name: "Traiteur salé" },
      ],
      articles: ARTICLES,
      byProduct: new Map(
        (
          [
            ["BAG", "ws_b"],
            ["TAR", "ws_p"],
            ["QUI", "ws_s"],
            ["CAK", "ws_s"],
          ] as const
        ).map(([product, workstationId]) => [
          product,
          [{ workstationId, finishes: true, position: null }],
        ]),
      ),
    };
    const known = LINES.filter((line) => ARTICLES.has(line));
    const prod = groupingOf(known, sku, { mode: "workstation", placement: sameNames });
    const shelf = groupingOf(known, sku, { mode: "shelf", shelves: SHELVES });

    expect(prod.map((group) => group.title)).toEqual(shelf.map((group) => group.title));
    expect(prod.map((group) => group.lines)).toEqual(shelf.map((group) => group.lines));
    // L'identité des groupes, elle, change : un poste n'est pas un rayon.
    expect(prod.map((group) => group.key)).toEqual(["ws:ws_b", "ws:ws_p", "ws:ws_s"]);
  });
});

describe("groupingOf — un seul poste par produit : toute ligne ressort une fois", () => {
  const sources = [
    ["mode boutique", { mode: "shelf", shelves: SHELVES }],
    ["mode boutique, rayons illisibles", { mode: "shelf", shelves: null }],
    ["mode prod, rien de placé", { mode: "workstation", placement: placement([]) }],
    [
      "mode prod, en partie placé",
      { mode: "workstation", placement: placement([["QUI", "ws_pastry"]]) },
    ],
    [
      "mode prod, tout placé",
      {
        mode: "workstation",
        placement: placement([
          ["QUI", "ws_pastry"],
          ["TAR", "ws_pastry"],
          ["CAK", "ws_bakery"],
          ["BAG", "ws_bakery"],
        ]),
      },
    ],
  ] as const;

  it.each(sources)("%s", (_label, source) => {
    const groups = groupingOf(LINES, sku, source);

    expect([...linesOf(groups)].sort()).toEqual([...LINES].sort());
    expect(groups.every((group) => group.lines.length > 0)).toBe(true);
    const sectioned = groups.filter((group) => group.sections.length > 0);
    for (const group of sectioned) {
      expect(group.sections.flatMap((section) => section.items).sort()).toEqual(
        [...group.lines].sort(),
      );
    }
  });
});

describe("groupingOf — la pile d'un poste", () => {
  const ALL_PASTRY: readonly (readonly [string, string])[] = [
    ["QUI", "ws_pastry"],
    ["TAR", "ws_pastry"],
    ["CAK", "ws_pastry"],
  ];

  function pastryLines(positions: readonly (readonly [string, number])[]): readonly string[] {
    const groups = groupingOf(["TAR-1", "QUI-8", "CAK-1", "QUI-6"], sku, {
      mode: "workstation",
      placement: placement(ALL_PASTRY, positions),
    });
    return groups.find((group) => group.key === "ws:ws_pastry")?.lines ?? [];
  }

  it("range les lignes d'un poste par la place de leur produit, chaque déclinaison sous le sien", () => {
    expect(
      pastryLines([
        ["CAK", 0],
        ["QUI", 1],
        ["TAR", 2],
      ]),
    ).toEqual(["CAK-1", "QUI-8", "QUI-6", "TAR-1"]);
  });

  it("met les produits sans place après, dans l'ordre reçu", () => {
    expect(pastryLines([["CAK", 0]])).toEqual(["CAK-1", "TAR-1", "QUI-8", "QUI-6"]);
  });

  it("sans aucune place, garde l'ordre reçu", () => {
    expect(pastryLines([])).toEqual(["TAR-1", "QUI-8", "CAK-1", "QUI-6"]);
  });
});

/**
 * Un produit sur plusieurs postes (plan
 * `documentation/fournil/plan-produit-sur-plusieurs-postes.md`, § 2.7).
 */
describe("groupingOf — un produit sur plusieurs postes", () => {
  const station = (
    workstationId: string,
    finishes: boolean,
    position: number | null = null,
  ): GroupingStation => ({ workstationId, finishes, position });

  /** La quiche passe à la Boulangerie (la pâte, une étape) et finit en Pâtisserie. */
  const SANDWICHED: GroupingPlacement = {
    workstations: WORKSTATIONS,
    articles: ARTICLES,
    byProduct: new Map([
      ["QUI", [station("ws_pastry", true, 1), station("ws_bakery", false, 0)]],
      ["BAG", [station("ws_bakery", true, 1)]],
      ["TAR", [station("ws_pastry", true, 0)]],
    ]),
  };

  it("ressort sous CHACUN de ses postes, avec son rôle dans chacun", () => {
    const groups = groupingOf(["TAR-1", "QUI-6", "BAG-1"], sku, {
      mode: "workstation",
      placement: SANDWICHED,
    });

    expect(groups.map((group) => [group.key, group.lines])).toEqual([
      ["ws:ws_bakery", ["QUI-6", "BAG-1"]],
      ["ws:ws_pastry", ["TAR-1", "QUI-6"]],
    ]);
    const [bakery, pastry] = groups;
    expect(bakery?.roles.get("QUI-6")).toBe("step");
    expect(bakery?.roles.get("BAG-1")).toBe("finishes");
    expect(pastry?.roles.get("QUI-6")).toBe("finishes");
    expect(pastry?.roles.get("TAR-1")).toBe("finishes");
  });

  it("trie chaque pile par la place du produit DANS CE poste", () => {
    const groups = groupingOf(["BAG-1", "QUI-6", "TAR-1"], sku, {
      mode: "workstation",
      placement: SANDWICHED,
    });

    // Première à la Boulangerie (place 0), seconde en Pâtisserie (place 1).
    expect(groups.find((group) => group.key === "ws:ws_bakery")?.lines).toEqual(["QUI-6", "BAG-1"]);
    expect(groups.find((group) => group.key === "ws:ws_pastry")?.lines).toEqual(["TAR-1", "QUI-6"]);
  });

  it("un poste d'étape archivé n'est pas lu : la ligne reste sous celui qui finit", () => {
    const groups = groupingOf(["QUI-6"], sku, {
      mode: "workstation",
      placement: { ...SANDWICHED, workstations: [{ id: "ws_pastry", name: "Pâtisserie" }] },
    });

    expect(groups.map((group) => group.key)).toEqual(["ws:ws_pastry"]);
  });

  it("le mode boutique la range une fois, sans rôle", () => {
    const groups = groupingOf(["QUI-6", "BAG-1"], sku, { mode: "shelf", shelves: SHELVES });

    expect(linesOf(groups)).toHaveLength(2);
    expect(groups.every((group) => group.roles.size === 0)).toBe(true);
  });

  it("un groupe « à ranger » ou hors catalogue ne donne aucun rôle", () => {
    const groups = groupingOf(["CAK-1", "XXX-1"], sku, {
      mode: "workstation",
      placement: SANDWICHED,
    });

    expect(groups.map((group) => group.kind)).toEqual(["unplaced", "off_catalog"]);
    expect(groups.every((group) => group.roles.size === 0)).toBe(true);
  });
});
