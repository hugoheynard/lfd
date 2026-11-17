import { SHELF_LABEL_OFF_CATALOG, type CatalogFamilyView } from "@lfd/contracts";

import type { ProductionOrderSnapshot } from "../../../../day/index.js";
import type { GroupingSource } from "../../../../shared/print/index.js";

type GroupingPlacement = Extract<GroupingSource, { readonly mode: "workstation" }>["placement"];
import { dayDossierFrom, dayDossierOf } from "../day-dossier.js";

/**
 * **Le récapitulatif du dossier dans les deux modes** (plan
 * `documentation/fournil/les-postes-du-fournil.md`, § 3.4) : un poste prend la place d'un
 * rayon, la page ne change pas. Aucune date comparée à l'horloge.
 */
const SALTY = { id: "fam-salty", name: "Traiteur salé", position: 1 };
const BREADS: CatalogFamilyView = { id: "fam-bread", name: "Pains", position: 0 };
const QUICHES: CatalogFamilyView = { id: "fam-quiche", name: "Quiches", position: 1, root: SALTY };

function order(
  reference: string,
  lines: readonly [sku: string, quantity: number][],
): ProductionOrderSnapshot {
  return {
    packed: null,
    orderId: `id-${reference}`,
    rank: 1,
    reference,
    customerLabel: `Client ${reference}`,
    fulfillmentMethod: "pickup",
    destination: "Boutique",
    dueAt: null,
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines: lines.map(([sku, quantity]) => ({
      sku,
      productName: sku,
      quantity,
      saleUnit: "piece",
    })),
  };
}

const ORDERS = [
  order("ORD-1", [
    ["QUI-6", 3],
    ["BAG-1", 40],
  ]),
  order("ORD-2", [
    ["QUI-8", 5],
    ["CAK-1", 2],
    ["OLD-1", 1],
  ]),
];

const SHELVES = new Map<string, CatalogFamilyView>([
  ["QUI-6", QUICHES],
  ["QUI-8", QUICHES],
  ["CAK-1", { ...SALTY, root: SALTY }],
  ["BAG-1", BREADS],
]);

function placement(byProduct: readonly (readonly [string, string])[]): GroupingPlacement {
  return {
    workstations: [
      { id: "ws_bakery", name: "Boulangerie" },
      { id: "ws_pastry", name: "Pâtisserie" },
    ],
    articles: new Map(
      [...SHELVES].map(([sku, family]) => [sku, { productSku: sku.slice(0, 3), family }]),
    ),
    byProduct: new Map(byProduct),
  };
}

function skusOf(groups: ReturnType<typeof dayDossierOf>["recap"]): readonly string[] {
  return groups.flatMap((group) => group.lines.map((line) => line.sku));
}

describe("dayDossierFrom", () => {
  it.each([false, true])(
    "mode boutique (sous-catégories %s) : le dossier d'aujourd'hui",
    (showSubcategories) => {
      expect(
        dayDossierFrom(ORDERS, { mode: "shelf", shelves: SHELVES }, [], showSubcategories),
      ).toEqual(dayDossierOf(ORDERS, SHELVES, [], showSubcategories));
    },
  );

  it("mode boutique, sous-catégories posées : un intertitre par sous-catégorie", () => {
    const dossier = dayDossierOf(ORDERS, SHELVES, [], true);

    expect(dossier.recap.map((group) => group.label)).toEqual([
      "Pains",
      "Traiteur salé",
      SHELF_LABEL_OFF_CATALOG,
    ]);
    expect([...(dossier.recap[1]?.intertitles ?? new Map())]).toEqual([["QUI-8", "Quiches"]]);
  });

  it("mode prod : les postes, le plus gros d'abord, puis le hors catalogue « à ranger »", () => {
    const dossier = dayDossierFrom(ORDERS, {
      mode: "workstation",
      placement: placement([
        ["QUI", "ws_pastry"],
        ["CAK", "ws_pastry"],
        ["BAG", "ws_bakery"],
      ]),
    });

    expect(dossier.recap.map((group) => [group.label, group.quantity])).toEqual([
      ["Boulangerie", 40],
      ["Pâtisserie", 10],
      [`${SHELF_LABEL_OFF_CATALOG} — à ranger`, 1],
    ]);
    expect(dossier.recap[1]?.lines.map((line) => line.sku)).toEqual(["QUI-8", "QUI-6", "CAK-1"]);
    expect(dossier.recap[1]?.intertitles).toBeUndefined();
    expect(dossier.pieces).toBe(51);
  });

  it("mode prod, sous-catégories posées : un poste n'a pas d'intertitre de boutique", () => {
    const dossier = dayDossierFrom(
      ORDERS,
      {
        mode: "workstation",
        placement: placement([
          ["QUI", "ws_pastry"],
          ["BAG", "ws_pastry"],
        ]),
      },
      [],
      true,
    );

    expect(dossier.recap[0]?.label).toBe("Pâtisserie");
    expect(dossier.recap[0]?.lines.map((line) => line.sku).sort()).toEqual([
      "BAG-1",
      "QUI-6",
      "QUI-8",
    ]);
    expect([...(dossier.recap[0]?.intertitles ?? new Map())]).toEqual([]);
    expect(dossier.recap[1]?.label).toBe("Traiteur salé — à ranger");
  });

  it.each([
    ["rien de placé", placement([])],
    ["en partie placé", placement([["QUI", "ws_pastry"]])],
  ])("toute ligne ressort une fois — mode prod, %s", (_label, placed) => {
    const prod = dayDossierFrom(ORDERS, { mode: "workstation", placement: placed });
    const shelf = dayDossierOf(ORDERS, SHELVES);

    expect([...skusOf(prod.recap)].sort()).toEqual([...skusOf(shelf.recap)].sort());
    expect(prod.pieces).toBe(shelf.pieces);
  });
});
