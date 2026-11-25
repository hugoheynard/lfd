import type { CatalogFamilyView } from "@lfd/contracts";

import type { GroupingSource } from "../../../../shared/print/index.js";
import {
  SIMULATION_ORDER_ID,
  simulationCoverOf,
  simulationLinesOf,
  simulationOrderOf,
} from "../production-simulation.js";

/** La commande fictive et la couverture de la simulation (plan des postes, § 3.11). */
const SALTY: CatalogFamilyView = { id: "fam-salty", name: "Traiteur salé", position: 1 };
const BREADS: CatalogFamilyView = { id: "fam-breads", name: "Pains", position: 2 };

const LINES = simulationLinesOf([
  { sku: "QUI-8", name: "Quiche — 8 parts" },
  { sku: "QUI-6", name: "Quiche — 6 parts" },
  { sku: "BAG", name: "Baguette" },
  { sku: "QUI-8", name: "Quiche — 8 parts (doublon)" },
  { sku: "GONE", name: "Tasse" },
]);

describe("simulationLinesOf / simulationOrderOf", () => {
  it("une pièce par référence, chaque référence une fois, dans l'ordre reçu", () => {
    expect(LINES.map((line) => [line.sku, line.quantity, line.saleUnit])).toEqual([
      ["QUI-8", 1, "piece"],
      ["QUI-6", 1, "piece"],
      ["BAG", 1, "piece"],
      ["GONE", 1, "piece"],
    ]);
  });

  it("une seule commande fictive, sans échéance, qui porte toutes les lignes", () => {
    const order = simulationOrderOf(LINES);
    expect(order.orderId).toBe(SIMULATION_ORDER_ID);
    expect(order.dueAt).toBeNull();
    expect(order.lines).toBe(LINES);
  });
});

describe("simulationCoverOf", () => {
  const shelves = new Map([
    ["QUI-8", SALTY],
    ["QUI-6", SALTY],
    ["BAG", BREADS],
  ]);

  it("mode boutique : les lignes comptées par rayon, aucun article « à ranger »", () => {
    const cover = simulationCoverOf(LINES, { mode: "shelf", shelves });

    expect(cover.lineCount).toBe(4);
    expect(cover.groups.map((group) => [group.title, group.lineCount])).toEqual([
      ["Traiteur salé", 2],
      ["Pains", 1],
      ["Hors catalogue", 1],
    ]);
    expect(cover.unplaced).toEqual([]);
  });

  it("mode prod : le poste, puis les rayons « à ranger », chaque ligne une fois, les sans-poste nommés", () => {
    const source: GroupingSource = {
      mode: "workstation",
      placement: {
        workstations: [{ id: "ws_pastry", name: "Pâtisserie" }],
        articles: new Map([
          ["QUI-8", { productSku: "QUI", family: SALTY }],
          ["QUI-6", { productSku: "QUI", family: SALTY }],
          ["BAG", { productSku: "BAG", family: BREADS }],
        ]),
        byProduct: finishingAt([["QUI", "ws_pastry"]]),
      },
    };

    const cover = simulationCoverOf(LINES, source);

    expect(cover.groups.map((group) => [group.kind, group.lineCount])).toEqual([
      ["workstation", 2],
      ["unplaced", 1],
      ["off_catalog", 1],
    ]);
    expect(cover.groups.reduce((sum, group) => sum + group.lineCount, 0)).toBe(LINES.length);
    expect(cover.unplaced).toEqual(["Baguette", "Tasse"]);
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
