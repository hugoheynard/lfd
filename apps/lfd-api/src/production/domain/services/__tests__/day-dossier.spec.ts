import {
  SHELF_LABEL_OFF_CATALOG,
  SHELF_LABEL_UNKNOWN,
  type CatalogFamilyView,
} from "@lfd/contracts";

import type { ProductionOrderSnapshot } from "../../entities/production-day.js";
import { dayDossierOf } from "../day-dossier.js";

/**
 * **Le dossier du jour, monté** — récapitulatif par rayon et pile de bons, en
 * fonction pure. Aucune date : rien ici ne se compare à l'horloge.
 */
const VIENNOISERIES: CatalogFamilyView = { id: "fam-vien", name: "Viennoiseries", position: 0 };
const PAINS: CatalogFamilyView = { id: "fam-pain", name: "Pains", position: 1 };

function order(
  reference: string,
  lines: readonly [sku: string, name: string, quantity: number][],
): ProductionOrderSnapshot {
  return {
    packed: null,
    orderId: `id-${reference}`,
    reference,
    customerLabel: `Client ${reference}`,
    fulfillmentMethod: "pickup",
    destination: "Boutique",
    dueAt: null,
    sheetDetails: null,
    lines: lines.map(([sku, productName, quantity]) => ({ sku, productName, quantity })),
  };
}

const ORDERS = [
  order("LFC-0003", [["PAI-SEI", "Pain de seigle", 2]]),
  order("LFC-0001", [
    ["VIE-001", "Croissant", 40],
    ["VIE-002", "Pain au chocolat", 40],
  ]),
  order("LFC-0002", [
    ["VIE-001", "Croissant", 10],
    ["OLD-001", "Retiré", 1],
  ]),
];

const SHELVES = new Map([
  ["VIE-001", VIENNOISERIES],
  ["VIE-002", VIENNOISERIES],
  ["PAI-SEI", PAINS],
]);

describe("dayDossierOf", () => {
  it("empile les bons par référence, quel que soit l'ordre reçu", () => {
    const dossier = dayDossierOf(ORDERS, SHELVES);
    expect(dossier.sheets.map((sheet) => sheet.reference)).toEqual([
      "LFC-0001",
      "LFC-0002",
      "LFC-0003",
    ]);
  });

  it("additionne par SKU, compte les commandes, et range par rayon dans l'ordre du référentiel", () => {
    const dossier = dayDossierOf(ORDERS, SHELVES);
    expect(dossier.recap.map((group) => [group.label, group.quantity])).toEqual([
      ["Viennoiseries", 90],
      ["Pains", 2],
      [SHELF_LABEL_OFF_CATALOG, 1],
    ]);
    expect(dossier.recap[0]?.lines).toEqual([
      { sku: "VIE-001", productName: "Croissant", quantity: 50, orderCount: 2 },
      { sku: "VIE-002", productName: "Pain au chocolat", quantity: 40, orderCount: 1 },
    ]);
    expect(dossier.pieces).toBe(93);
  });

  it("dit « Rayon inconnu », jamais « Hors catalogue », quand les rayons n'ont pas été lus", () => {
    const dossier = dayDossierOf(ORDERS, null);
    expect(dossier.recap.map((group) => group.label)).toEqual([SHELF_LABEL_UNKNOWN]);
  });

  it("à quantité égale, range par nom — deux tirages rendent la même feuille", () => {
    const dossier = dayDossierOf(
      [
        order("A", [
          ["Z", "Zeste", 5],
          ["B", "Brioche", 5],
        ]),
      ],
      new Map(),
    );
    expect(dossier.recap[0]?.lines.map((line) => line.productName)).toEqual(["Brioche", "Zeste"]);
  });
});
