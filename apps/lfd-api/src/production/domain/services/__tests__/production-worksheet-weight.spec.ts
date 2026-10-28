import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import type {
  ProducedItemSnapshot,
  ProductionBatchSnapshot,
} from "../../entities/production-day.js";
import { forecastMatrix } from "../production-forecast.js";
import { worksheetGroupsOf } from "../production-worksheet-groups.js";
import { worksheetOf, type WorksheetSources } from "../production-worksheet.js";
import { ServiceRange } from "../../value-objects/service-range.value-object.js";

/**
 * **La fiche d'atelier et le prévisionnel, au poids** (plan
 * `documentation/pricing/vente-au-poids.md`, P6) : le fournil sort des
 * GRAMMES d'un article au poids, ses fournées en grammes ; les totaux qui
 * additionnent des articles différents le comptent pour une pièce.
 *
 * Instants absolus : recopiés, jamais comparés à l'horloge (`worksheetOf` est pur).
 */
const TIRAGE = new Date("2026-09-13T04:20:00.000Z");
const FOUR = new Date("2026-09-13T05:10:00.000Z");

const counted = (
  sku: string,
  quantity: number,
  saleUnit: "piece" | "weight",
): ProducedItemSnapshot => ({
  sku,
  productName: sku,
  quantity,
  saleUnit,
  done: null,
});

function batch(id: string, sku: string, quantity: number): ProductionBatchSnapshot {
  return {
    id,
    sku,
    quantity,
    recorded: { at: FOUR, by: "staff-1", initials: "MB" },
    cancelled: null,
    returned: 0,
    pendingReturn: 0,
  };
}

function sources(overrides: Partial<WorksheetSources>): WorksheetSources {
  return {
    serviceDay: "2026-09-13",
    closedAt: TIRAGE,
    retakenAt: null,
    counts: [],
    batches: [],
    demand: [],
    arrivals: [],
    containers: new Map(),
    ...overrides,
  };
}

function arrival(lines: ProducibleOrder["lines"]): ProducibleOrder {
  return {
    orderId: "late",
    reference: "ORD-late",
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines,
  };
}

describe("worksheetOf — le contenant d'un article au poids se compte en grammes", () => {
  const TRAY = { unitsPerContainer: 1500, singular: "plaque", plural: "plaques" };

  it.each([
    [1500, "1 plaque"],
    [1501, "2 plaques"],
    [3000, "2 plaques"],
    [3250, "3 plaques"],
  ])("%i g pour une plaque de 1 500 g : « %s »", (grams, label) => {
    const sheet = worksheetOf(
      sources({
        counts: [counted("SAU", grams, "weight")],
        containers: new Map([["SAU", TRAY]]),
      }),
    );

    expect(sheet.lines[0]).toMatchObject({ saleUnit: "weight", containerLabel: label });
  });

  it("une journée mêlée : chaque article se compte dans son unité, contre son propre contenant", () => {
    const sheet = worksheetOf(
      sources({
        counts: [counted("CRO", 41, "piece"), counted("SAU", 1250, "weight")],
        containers: new Map([
          ["CRO", { unitsPerContainer: 10, singular: "tourneuse", plural: "tourneuses" }],
          ["SAU", TRAY],
        ]),
      }),
    );

    expect(sheet.lines.map((line) => [line.sku, line.containerLabel])).toEqual(
      expect.arrayContaining([
        ["CRO", "5 tourneuses"],
        ["SAU", "1 plaque"],
      ]),
    );
  });
});

describe("worksheetOf — une ligne au poids", () => {
  it("garde l'unité, et compte sorti, reste et surplus en grammes", () => {
    const sheet = worksheetOf(
      sources({
        counts: [counted("SAU", 2500, "weight")],
        batches: [batch("a", "SAU", 1000), batch("b", "SAU", 1000)],
      }),
    );

    expect(sheet.lines[0]).toMatchObject({
      sku: "SAU",
      quantity: 2500,
      saleUnit: "weight",
      produced: 2000,
      remaining: 500,
      surplus: 0,
      done: false,
    });
  });

  it("une fournée qui dépasse le poids compte le surplus en grammes", () => {
    const sheet = worksheetOf(
      sources({ counts: [counted("SAU", 1250, "weight")], batches: [batch("a", "SAU", 1300)] }),
    );

    expect(sheet.lines[0]).toMatchObject({ done: true, remaining: 0, surplus: 50 });
  });

  it("ne range pas 2 500 g devant 48 croissants : le poids pèse une pièce dans le tri", () => {
    const sheet = worksheetOf(
      sources({ counts: [counted("SAU", 2500, "weight"), counted("CRO", 48, "piece")] }),
    );

    expect(sheet.lines.map((line) => line.sku)).toEqual(["CRO", "SAU"]);
  });

  it("une journée ouverte sert la demande avec son unité", () => {
    const sheet = worksheetOf(
      sources({
        closedAt: null,
        demand: [{ sku: "SAU", productName: "Saumon", quantity: 750, saleUnit: "weight" }],
      }),
    );

    expect(sheet.lines[0]).toMatchObject({ quantity: 750, saleUnit: "weight" });
  });

  it("l'écart d'un retirage dit les grammes de l'article, et compte UNE pièce de plus", () => {
    const sheet = worksheetOf(
      sources({
        counts: [counted("SAU", 1000, "weight"), counted("CRO", 10, "piece")],
        arrivals: [
          arrival([
            { sku: "SAU", productName: "Saumon", quantity: 500, saleUnit: "weight" },
            { sku: "CRO", productName: "Croissant", quantity: 6, saleUnit: "piece" },
          ]),
        ],
      }),
    );

    expect(sheet.drift?.addedUnits).toBe(7);
    expect(sheet.drift?.lines).toEqual([
      { sku: "CRO", productName: "CRO", saleUnit: "piece", from: 10, to: 16, done: false },
      { sku: "SAU", productName: "SAU", saleUnit: "weight", from: 1000, to: 1500, done: false },
    ]);
  });
});

describe("worksheetGroupsOf — les compteurs d'une fiche mêlée", () => {
  it("compte la ligne au poids pour une pièce, faite seulement quand tout son poids est sorti", () => {
    const lines = worksheetOf(
      sources({
        counts: [counted("SAU", 1000, "weight"), counted("CRO", 10, "piece")],
        batches: [batch("a", "SAU", 900), batch("b", "CRO", 4)],
      }),
    ).lines;

    const [group] = worksheetGroupsOf(lines, new Map());

    expect(group).toMatchObject({ totalUnits: 11, doneUnits: 4, remainingUnits: 7 });
  });

  it("une fois le poids entier sorti, la ligne au poids compte sa pièce faite", () => {
    const lines = worksheetOf(
      sources({ counts: [counted("SAU", 1000, "weight")], batches: [batch("a", "SAU", 1000)] }),
    ).lines;

    expect(worksheetGroupsOf(lines, new Map())[0]).toMatchObject({
      totalUnits: 1,
      doneUnits: 1,
      remainingUnits: 0,
    });
  });
});

describe("forecastMatrix — au poids", () => {
  const RANGE = ServiceRange.of("2026-09-03", "2026-09-04");

  it("garde les grammes sur la ligne de l'article, et le compte pour une pièce en colonne", () => {
    const matrix = forecastMatrix(
      RANGE,
      [],
      [
        {
          day: "2026-09-03",
          orderCount: 2,
          items: [
            { sku: "SAU", productName: "Saumon", quantity: 1750, saleUnit: "weight" },
            { sku: "CRO", productName: "Croissant", quantity: 40, saleUnit: "piece" },
          ],
        },
      ],
    );

    expect(matrix.rows).toEqual([
      {
        sku: "CRO",
        productName: "Croissant",
        saleUnit: "piece",
        quantities: [40, 0],
        resupplyQuantities: [0, 0],
        totalUnits: 40,
      },
      {
        sku: "SAU",
        productName: "Saumon",
        saleUnit: "weight",
        quantities: [1750, 0],
        resupplyQuantities: [0, 0],
        totalUnits: 1750,
      },
    ]);
    expect(matrix.columns[0]?.totalUnits).toBe(41);
    expect(matrix.totalUnits).toBe(41);
  });

  it("un jour où seul un article au poids sort n'est pas le pic devant un jour de croissants", () => {
    const matrix = forecastMatrix(
      RANGE,
      [],
      [
        {
          day: "2026-09-03",
          orderCount: 1,
          items: [{ sku: "SAU", productName: "Saumon", quantity: 9000, saleUnit: "weight" }],
        },
        {
          day: "2026-09-04",
          orderCount: 1,
          items: [{ sku: "CRO", productName: "Croissant", quantity: 12, saleUnit: "piece" }],
        },
      ],
    );

    expect(matrix.peakDate).toBe("2026-09-04");
  });
});
