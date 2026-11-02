import type { DossierRecapGroup, DossierRecapLine } from "../day-dossier.js";
import { dossierCalendarOf } from "../day-dossier-calendar.js";
import { calendarScale } from "../day-dossier-calendar-pdf.js";
import type { TrancheThreshold } from "../production-tranches.js";

/**
 * **Le calendrier du dossier** — le total du récapitulatif réparti dans les
 * tranches. Aucune date : les heures ne se comparent qu'entre elles.
 */

function line(sku: string, quantity: number): DossierRecapLine {
  return {
    sku,
    productName: `Produit ${sku}`,
    quantity,
    saleUnit: "piece",
    orderCount: 1,
    resupplyQuantity: 0,
    resupplyCount: 0,
  };
}

function group(label: string, lines: readonly DossierRecapLine[]): DossierRecapGroup {
  return {
    label,
    quantity: lines.reduce((sum, item) => sum + item.quantity, 0),
    resupplyQuantity: 0,
    lines,
  };
}

function at(before: string, quantity: number, cumulative = quantity): TrancheThreshold {
  return { kind: "deadline", before, quantity, cumulative };
}

describe("dossierCalendarOf", () => {
  it("répartit le total dans ses tranches, dans l'ordre des heures", () => {
    const [page] = dossierCalendarOf(
      [group("Viennoiseries", [line("CROI", 100)])],
      new Map([["CROI", [at("07:00", 40, 60), at("05:00", 20)]]]),
    );

    expect(page?.columns.map((column) => column.label)).toEqual([
      "avant 05:00",
      "avant 07:00",
      "Sans heure",
    ]);
    expect(page?.rows[0]?.quantities).toEqual([20, 40, 40]);
  });

  it("la somme d'une ligne est toujours le total du produit", () => {
    const [page] = dossierCalendarOf(
      [group("Pains", [line("BAG", 300), line("CAMP", 12)])],
      new Map([
        [
          "BAG",
          [at("05:00", 200), { kind: "undated", before: null, quantity: 50, cumulative: 250 }],
        ],
      ]),
    );

    for (const row of page?.rows ?? []) {
      expect(row.quantities.reduce((sum, quantity) => sum + quantity, 0)).toBe(row.line.quantity);
    }
  });

  it("sans échéance, tout le produit est « Sans heure »", () => {
    const [page] = dossierCalendarOf([group("Pâtisserie", [line("TART", 6)])], new Map());

    expect(page?.columns).toEqual([{ key: "rest", kind: "rest", label: "Sans heure" }]);
    expect(page?.rows[0]?.quantities).toEqual([6]);
  });

  it("des échéances qui dépassent le total ne répartissent rien, et le disent", () => {
    const [page] = dossierCalendarOf(
      [group("Pains", [line("BAG", 10)])],
      new Map([["BAG", [at("05:00", 30)]]]),
    );

    expect(page?.rows[0]).toMatchObject({ mismatch: true, quantities: [10] });
    expect(page?.columns.map((column) => column.label)).toEqual(["Sans heure"]);
  });

  it("une tranche avant la première va dans la première, une journée sans heure dans la sienne", () => {
    const [page] = dossierCalendarOf(
      [group("Viennoiseries", [line("A", 10), line("B", 5)])],
      new Map<string, readonly TrancheThreshold[]>([
        [
          "A",
          [
            {
              kind: "before_first",
              before: "05:00",
              quantity: 10,
              cumulative: 10,
              earliest: "04:30",
            },
          ],
        ],
        ["B", [{ kind: "day", before: null, quantity: 5, cumulative: 5 }]],
      ]),
    );

    expect(page?.columns.map((column) => column.label)).toEqual(["avant 05:00", "Dans la journée"]);
    expect(page?.rows.map((row) => row.quantities)).toEqual([
      [10, 0],
      [0, 5],
    ]);
  });

  it("une page par catégorie, avec seulement les tranches qu'elle touche", () => {
    const pages = dossierCalendarOf(
      [group("Viennoiseries", [line("A", 10)]), group("Pains", [line("B", 10)])],
      new Map([
        ["A", [at("05:00", 10)]],
        ["B", [at("09:00", 10)]],
      ]),
    );

    expect(pages.map((page) => [page.label, page.columns.map((column) => column.key)])).toEqual([
      ["Viennoiseries", ["05:00"]],
      ["Pains", ["09:00"]],
    ]);
  });

  it("garde les intertitres de sous-catégorie du récapitulatif", () => {
    const intertitles = new Map([["A", "Croissants"]]);
    const [page] = dossierCalendarOf(
      [{ ...group("Viennoiseries", [line("A", 1)]), intertitles }],
      new Map(),
    );

    expect(page?.intertitles).toBe(intertitles);
  });
});

/** Hugo, 2026-11-02 : « réduis la police au-delà de 6 colonnes ». */
describe("calendarScale", () => {
  it("garde la taille pleine jusqu'à six tranches", () => {
    expect([1, 6].map(calendarScale)).toEqual([1, 1]);
  });

  it("rétrécit au-delà, jamais sous le plancher", () => {
    expect(calendarScale(8)).toBeCloseTo(0.75);
    expect(calendarScale(12)).toBeCloseTo(0.55);
    expect(calendarScale(30)).toBeCloseTo(0.55);
  });
});
