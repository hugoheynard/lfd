import { UNSHELVED_WORKSHOP_GROUP_KEY, type CatalogFamilyView } from "@lfd/contracts";

import type { GroupingSource } from "../../../../shared/print/index.js";

type GroupingPlacement = Extract<GroupingSource, { readonly mode: "workstation" }>["placement"];
import { worksheetGroupsFrom, worksheetGroupsOf } from "../production-worksheet-groups.js";
import type { WorksheetLine } from "../production-worksheet.js";

/**
 * **Les fiches dans les deux modes** (plan `fournil/plan-postes-du-fournil.md`,
 * § 3.4) : un poste prend la place d'un rayon. Fonction pure, sans date
 * comparée à l'horloge.
 */
function line(sku: string, quantity: number): WorksheetLine {
  return {
    sku,
    productName: sku,
    quantity,
    saleUnit: "piece",
    containerLabel: null,
    done: false,
    initials: null,
    doneAt: null,
    produced: 0,
    remaining: quantity,
    surplus: 0,
    batches: [],
    container: null,
    pendingReturn: 0,
  };
}

const SALTY = { id: "fam-salty", name: "Traiteur salé", position: 1 };
const BREADS: CatalogFamilyView = { id: "fam-bread", name: "Pains", position: 0 };
const QUICHES: CatalogFamilyView = { id: "fam-quiche", name: "Quiches", position: 1, root: SALTY };

const SHELVES = new Map<string, CatalogFamilyView>([
  ["QUI-8", QUICHES],
  ["BAG-1", BREADS],
]);
const LINES = [line("QUI-8", 12), line("BAG-1", 40), line("XXX-1", 2)];

/** Deux postes : le pain au premier, la quiche au second. Sans poste : rien de placé. */
function placement(names: readonly (readonly [string, string])[]): GroupingPlacement {
  const [bread, quiche] = names;
  return {
    workstations: names.map(([id, name]) => ({ id, name })),
    articles: new Map([
      ["QUI-8", { productSku: "QUI", family: QUICHES }],
      ["BAG-1", { productSku: "BAG", family: BREADS }],
    ]),
    byProduct: new Map(
      bread === undefined || quiche === undefined
        ? []
        : [
            ["QUI", quiche[0]],
            ["BAG", bread[0]],
          ],
    ),
  };
}

describe("worksheetGroupsFrom", () => {
  it.each([false, true])(
    "mode boutique (sous-catégories %s) : les fiches d'aujourd'hui, marquées rayon",
    (showSubcategories) => {
      const groups = worksheetGroupsFrom(
        LINES,
        { mode: "shelf", shelves: SHELVES },
        showSubcategories,
      );

      expect(groups).toEqual(worksheetGroupsOf(LINES, SHELVES, showSubcategories));
      expect(groups.map((group) => [group.kind, group.workstation, group.unplaced])).toEqual([
        ["shelf", null, false],
        ["shelf", null, false],
        ["off_catalog", null, false],
      ]);
    },
  );

  it("mode prod : une fiche par poste, sans famille, avec son poste", () => {
    const groups = worksheetGroupsFrom(LINES, {
      mode: "workstation",
      placement: placement([
        ["ws_bakery", "Boulangerie"],
        ["ws_pastry", "Pâtisserie"],
      ]),
    });

    expect(groups.map((group) => [group.key, group.label, group.family])).toEqual([
      ["ws:ws_bakery", "Boulangerie", null],
      ["ws:ws_pastry", "Pâtisserie", null],
      [UNSHELVED_WORKSHOP_GROUP_KEY, "Hors catalogue — à ranger", null],
    ]);
    expect(groups[1]).toMatchObject({
      kind: "workstation",
      workstation: { id: "ws_pastry", name: "Pâtisserie" },
      unplaced: false,
      lineCount: 1,
      totalUnits: 12,
    });
    expect(groups[1]?.sections).toBeUndefined();
  });

  it("mode prod, sous-catégories posées : les rayons d'où viennent les lignes du poste", () => {
    const groups = worksheetGroupsFrom(
      LINES,
      {
        mode: "workstation",
        placement: {
          ...placement([]),
          workstations: [{ id: "ws_all", name: "Fournil" }],
          byProduct: new Map([
            ["QUI", "ws_all"],
            ["BAG", "ws_all"],
          ]),
        },
      },
      true,
    );

    expect(groups[0]?.sections).toEqual([
      { key: "fam-bread", label: "Pains", skus: ["BAG-1"] },
      { key: "fam-salty", label: "Traiteur salé", skus: ["QUI-8"] },
    ]);
    expect(groups[0]?.lines.map((l) => l.sku)).toEqual(["BAG-1", "QUI-8"]);
  });

  it("mode prod, produit sans poste : son rayon « à ranger », avec sa famille", () => {
    const groups = worksheetGroupsFrom([line("QUI-8", 12)], {
      mode: "workstation",
      placement: placement([]),
    });

    expect(groups).toEqual([
      expect.objectContaining({
        key: "fam-salty",
        label: "Traiteur salé — à ranger",
        kind: "unplaced",
        unplaced: true,
        family: SALTY,
      }),
    ]);
  });

  it("chaque rayon a un poste du même nom, réglage éteint : mêmes fiches, autre identité", () => {
    const known = LINES.filter((l) => SHELVES.has(l.sku));
    const prod = worksheetGroupsFrom(known, {
      mode: "workstation",
      placement: placement([
        ["ws_b", "Pains"],
        ["ws_s", "Traiteur salé"],
      ]),
    });
    const shelf = worksheetGroupsOf(known, SHELVES);
    const content = (group: (typeof prod)[number]) => ({
      label: group.label,
      lines: group.lines,
      lineCount: group.lineCount,
      totalUnits: group.totalUnits,
      sections: group.sections,
    });

    expect(prod.map(content)).toEqual(shelf.map(content));
    expect(prod.map((group) => group.key)).toEqual(["ws:ws_b", "ws:ws_s"]);
    expect(shelf.map((group) => group.key)).toEqual(["fam-bread", "fam-salty"]);
  });
});
