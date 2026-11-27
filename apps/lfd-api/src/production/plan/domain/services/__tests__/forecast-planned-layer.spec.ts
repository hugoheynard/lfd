import { ServiceRange } from "../../../../day/index.js";
import { withPlannedLayer } from "../forecast-planned-layer.js";
import { forecastMatrix } from "../production-forecast.js";

const RANGE = ServiceRange.of("2026-09-03", "2026-09-05");

const ARRESTED = [
  {
    day: "2026-09-03",
    items: [{ sku: "PAI-BAG", productName: "Baguette", quantity: 186, saleUnit: "piece" as const }],
    orderCount: 12,
  },
];

const EXPECTED = [
  {
    day: "2026-09-04",
    items: [{ sku: "PAI-BAG", productName: "Baguette", quantity: 200, saleUnit: "piece" as const }],
    orderCount: 9,
  },
];

describe("withPlannedLayer — la couche « planifié, non commandé »", () => {
  const matrix = forecastMatrix(RANGE, ARRESTED, EXPECTED);

  it("rend la matrice intacte et des zéros sans brouillon", () => {
    const layered = withPlannedLayer(matrix, []);

    expect(layered.totalUnits).toBe(matrix.totalUnits);
    expect(layered.peakDate).toBe(matrix.peakDate);
    expect(layered.columns.map((column) => column.plannedUnits)).toEqual([0, 0, 0]);
    expect(layered.rows.map((row) => row.plannedQuantities)).toEqual([[0, 0, 0]]);
  });

  it("ne touche ni aux quantités, ni aux totaux, ni au pic, même quand le brouillon dépasse la demande", () => {
    const layered = withPlannedLayer(matrix, [
      {
        day: "2026-09-05",
        items: [{ sku: "PAI-BAG", productName: "Baguette", quantity: 900, saleUnit: "piece" }],
      },
    ]);

    expect(layered.peakDate).toBe("2026-09-04");
    expect(layered.totalUnits).toBe(386);
    expect(layered.columns.map((column) => column.totalUnits)).toEqual([186, 200, 0]);
    expect(layered.rows[0]).toMatchObject({
      quantities: [186, 200, 0],
      totalUnits: 386,
      plannedQuantities: [0, 0, 900],
    });
  });

  it("n'en pose aucun sur une journée arrêtée : son compte est figé", () => {
    const layered = withPlannedLayer(matrix, [
      {
        day: "2026-09-03",
        items: [{ sku: "PAI-BAG", productName: "Baguette", quantity: 50, saleUnit: "piece" }],
      },
    ]);

    expect(layered.columns[0]?.plannedUnits).toBe(0);
    expect(layered.rows[0]?.plannedQuantities).toEqual([0, 0, 0]);
  });

  it("ajoute à sa place la ligne d'un article seulement planifié, à zéro dans la demande", () => {
    const layered = withPlannedLayer(matrix, [
      {
        day: "2026-09-04",
        items: [{ sku: "AAA-PAIN", productName: "Pain de mie", quantity: 4, saleUnit: "piece" }],
      },
    ]);

    expect(layered.rows.map((row) => row.sku)).toEqual(["AAA-PAIN", "PAI-BAG"]);
    expect(layered.rows[0]).toEqual({
      sku: "AAA-PAIN",
      productName: "Pain de mie",
      saleUnit: "piece",
      quantities: [0, 0, 0],
      resupplyQuantities: [0, 0, 0],
      totalUnits: 0,
      plannedQuantities: [0, 4, 0],
    });
    expect(layered.columns[1]?.plannedUnits).toBe(4);
  });

  it("compte un article au poids pour une pièce au pied, ses grammes sur sa ligne", () => {
    const layered = withPlannedLayer(matrix, [
      {
        day: "2026-09-05",
        items: [{ sku: "FRO-COM", productName: "Comté", quantity: 750, saleUnit: "weight" }],
      },
    ]);

    expect(layered.columns[2]?.plannedUnits).toBe(1);
    expect(layered.rows.find((row) => row.sku === "FRO-COM")?.plannedQuantities).toEqual([
      0, 0, 750,
    ]);
  });

  it("ignore un jour hors de la plage", () => {
    const layered = withPlannedLayer(matrix, [
      {
        day: "2026-09-09",
        items: [{ sku: "PAI-BAG", productName: "Baguette", quantity: 5, saleUnit: "piece" }],
      },
    ]);

    expect(layered.columns.map((column) => column.plannedUnits)).toEqual([0, 0, 0]);
  });
});
