import {
  SHELF_LABEL_OFF_CATALOG,
  SHELF_LABEL_UNKNOWN,
  UNSHELVED_WORKSHOP_GROUP_KEY,
  type CatalogCategory,
} from "@lfd/contracts";

import { worksheetGroupsOf } from "../production-worksheet-groups.js";
import type { WorksheetLine } from "../production-worksheet.js";

/**
 * **Le rangement par rayon**, en fonction pure : des lignes déjà triées, une
 * table de rayons, et ce qui en sort. Ni Nest, ni base, ni double.
 *
 * Aucune date comparée à l'horloge : l'instant d'une coche n'est que recopié.
 */
const COCHE = new Date(0);

function line(sku: string, quantity: number, done = false): WorksheetLine {
  return {
    sku,
    productName: sku,
    quantity,
    containerLabel: null,
    done,
    initials: done ? "MB" : null,
    doneAt: done ? COCHE : null,
  };
}

function shelves(entries: readonly (readonly [string, CatalogCategory])[]) {
  return new Map<string, CatalogCategory>(entries);
}

describe("worksheetGroupsOf", () => {
  it("range les fiches dans l'ordre de la VITRINE, pas dans l'ordre des lignes", () => {
    const groups = worksheetGroupsOf(
      [line("CHO-1", 50), line("PAI-1", 40), line("VIE-1", 30)],
      shelves([
        ["CHO-1", "chocolat"],
        ["PAI-1", "pain"],
        ["VIE-1", "viennoiserie"],
      ]),
    );

    expect(groups.map((group) => group.key)).toEqual(["viennoiserie", "pain", "chocolat"]);
    expect(groups[0]).toMatchObject({ category: "viennoiserie", label: "Viennoiseries" });
  });

  it("met le groupe sans rayon en DERNIER, libellé « Hors catalogue »", () => {
    const groups = worksheetGroupsOf(
      [line("XXX-1", 99), line("PAI-1", 10)],
      shelves([["PAI-1", "pain"]]),
    );

    expect(groups.map((group) => group.key)).toEqual(["pain", UNSHELVED_WORKSHOP_GROUP_KEY]);
    expect(groups[1]).toMatchObject({ category: null, label: SHELF_LABEL_OFF_CATALOG });
  });

  it("🔴 une table ILLISIBLE range tout en « Rayon inconnu », jamais « Hors catalogue »", () => {
    // « Hors catalogue » affirmerait que le fournil fabrique des articles retirés
    // de la vente — alors qu'on ne sait simplement pas.
    const groups = worksheetGroupsOf([line("VIE-1", 10), line("PAI-1", 5)], null);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: UNSHELVED_WORKSHOP_GROUP_KEY,
      category: null,
      label: SHELF_LABEL_UNKNOWN,
      lineCount: 2,
    });
  });

  it("ne rend aucun groupe vide", () => {
    expect(worksheetGroupsOf([], shelves([]))).toEqual([]);
    expect(worksheetGroupsOf([], null)).toEqual([]);
    const groups = worksheetGroupsOf([line("PAI-1", 5)], shelves([["PAI-1", "pain"]]));
    expect(groups.map((group) => group.key)).toEqual(["pain"]);
  });

  it("compte les lignes et les pièces — faites, restantes, totales", () => {
    const [pain] = worksheetGroupsOf(
      [line("PAI-1", 40, true), line("PAI-2", 25), line("PAI-3", 10, true)],
      shelves([
        ["PAI-1", "pain"],
        ["PAI-2", "pain"],
        ["PAI-3", "pain"],
      ]),
    );

    expect(pain).toMatchObject({
      lineCount: 3,
      pendingCount: 1,
      doneCount: 2,
      totalUnits: 75,
      doneUnits: 50,
      remainingUnits: 25,
    });
  });

  it("GARDE l'ordre reçu dans `pending` et dans `done`", () => {
    // `worksheetOf` a déjà trié : retrier ici ferait deux règles pour un ordre.
    const [pain] = worksheetGroupsOf(
      [
        line("PAI-A", 5),
        line("PAI-B", 50, true),
        line("PAI-C", 30),
        line("PAI-D", 20, true),
        line("PAI-E", 40),
      ],
      shelves([
        ["PAI-A", "pain"],
        ["PAI-B", "pain"],
        ["PAI-C", "pain"],
        ["PAI-D", "pain"],
        ["PAI-E", "pain"],
      ]),
    );

    expect(pain?.pending.map((entry) => entry.sku)).toEqual(["PAI-A", "PAI-C", "PAI-E"]);
    expect(pain?.pendingCount).toBe(3);
    expect(pain?.done.map((entry) => entry.sku)).toEqual(["PAI-B", "PAI-D"]);
  });
});
