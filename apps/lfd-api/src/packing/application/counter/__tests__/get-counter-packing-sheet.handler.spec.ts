import { CounterPackingSheetNotFoundError } from "../../../domain/errors/packing-counter-errors.js";
import {
  CounterPackingSheetReader,
  type CounterPackingSheetSource,
} from "../../../domain/ports/counter-packing-sheet.reader.js";
import type { BoardOrder, BoardStock } from "../../../domain/ports/packing-board.reader.js";
import { GetCounterPackingSheetHandler } from "../get-counter-packing-sheet.handler.js";
import { GetCounterPackingSheetQuery } from "../get-counter-packing-sheet.query.js";

// Des instants comparés entre eux, jamais au mur.
const AT = new Date(1_000);

/** La fiche que les tables du colisage rendraient : la commande demandée est notée. */
class FixedSheets extends CounterPackingSheetReader {
  readonly asked: string[] = [];

  constructor(private readonly source: CounterPackingSheetSource | null) {
    super();
  }

  latestOf(orderId: string): Promise<CounterPackingSheetSource | null> {
    this.asked.push(orderId);
    return Promise.resolve(this.source);
  }
}

/** 5 croissants dont 3 au sac, 2 pains cochés et au sac. */
function order(packed: boolean): BoardOrder {
  return {
    orderId: "o-1",
    rank: 1,
    reference: "ORD-1",
    customerLabel: "Le Bistrot",
    fulfillmentMethod: "pickup",
    clientele: null,
    siteId: null,
    dueAt: null,
    drawnAt: AT,
    packed: packed ? { at: AT, by: "staff-1" } : null,
    containers: 1,
    containerMode: "listed",
    lines: [
      { sku: "CRO", productName: "Croissant", quantity: 5, packed: null, saleUnit: "piece" },
      {
        sku: "PAIN",
        productName: "Pain",
        quantity: 2,
        packed: { at: AT, by: "staff-1", initials: "HH" },
        saleUnit: "piece",
      },
    ],
    containerList: [
      {
        id: "c-1",
        nature: "bag",
        label: "Sac 1",
        bin: null,
        lines: [
          { sku: "CRO", quantity: 3 },
          { sku: "PAIN", quantity: 2 },
        ],
      },
    ],
    shortfallReportedAt: null,
  };
}

function stock(sku: string, received: number, packed: number): BoardStock {
  return { sku, received, returned: 0, packed, sentToShop: 0, reserved: 0 };
}

function run(source: CounterPackingSheetSource | null) {
  const sheets = new FixedSheets(source);
  const handler = new GetCounterPackingSheetHandler(sheets);
  return { sheets, result: handler.execute(new GetCounterPackingSheetQuery("o-1")) };
}

describe("GetCounterPackingSheetHandler", () => {
  it("rend la fiche réduite de la commande : lignes, pièces posées, bac ouvert", async () => {
    const { sheets, result } = run({
      order: order(false),
      stocks: [stock("CRO", 3, 3), stock("PAIN", 2, 2)],
    });

    await expect(result).resolves.toEqual({
      orderId: "o-1",
      reference: "ORD-1",
      lineCount: 2,
      packedLines: 1,
      packedPieces: 5,
      packedAt: null,
      lines: [
        // Il reste 2 croissants à poser, et la réserve n'en a plus : le four.
        { sku: "CRO", quantity: 5, packed: false, awaitingProduction: true, allocated: 3 },
        { sku: "PAIN", quantity: 2, packed: true, awaitingProduction: false, allocated: 2 },
      ],
    });
    expect(sheets.asked).toEqual(["o-1"]);
  });

  it("ne dit plus « au four » quand la réserve couvre le reste à poser", async () => {
    const { result } = run({ order: order(false), stocks: [stock("CRO", 5, 3)] });

    expect((await result).lines[0]).toMatchObject({ sku: "CRO", awaitingProduction: false });
  });

  it("porte l'instant du bac fermé", async () => {
    const { result } = run({ order: order(true), stocks: [] });

    expect((await result).packedAt).toBe(AT.toISOString());
  });

  it("refuse, nommément, une commande sans fiche de colis", async () => {
    const { result } = run(null);

    await expect(result).rejects.toBeInstanceOf(CounterPackingSheetNotFoundError);
  });
});
