import { instantToLocal } from "@lfd/contracts";

import type { BoardLine, BoardOrder } from "../../ports/packing-board.reader.js";
import { packingBoardOf } from "../packing-board.js";

/**
 * Plan sur mesure, M4 : la ligne servie au poste porte le marqueur reçu du
 * fournil, et `null` quand on ne sait pas. Instants recopiés, jamais
 * comparés à l'horloge.
 */
const NOW = new Date(0);

function line(sku: string, madeToOrder?: boolean | null): BoardLine {
  return {
    sku,
    productName: sku,
    quantity: 1,
    saleUnit: "piece",
    packed: null,
    ...(madeToOrder === undefined ? {} : { madeToOrder }),
  };
}

function boardWith(lines: readonly BoardLine[]) {
  const order: BoardOrder = {
    orderId: "o1",
    rank: 1,
    reference: "ORD-o1",
    customerLabel: "Le Bistrot",
    fulfillmentMethod: "pickup",
    clientele: null,
    siteId: null,
    dueAt: null,
    drawnAt: NOW,
    packed: null,
    containers: 0,
    containerMode: "listed",
    lines,
    containerList: [],
    shortfallReportedAt: null,
  };
  return packingBoardOf({
    date: instantToLocal(NOW).day,
    day: { orders: [order], withdrawn: [], stocks: [] },
    now: NOW,
    destinationOf: () => "Adresse",
    authorName: () => null,
    heldOrders: new Set(),
    cold: { coldSkus: new Set(), isothermBinIds: new Set() },
    departures: new Map(),
  });
}

describe("packingBoardOf — le marqueur « sur mesure » (M4)", () => {
  it("sert le marqueur de chaque ligne, et null quand on ne sait pas", () => {
    const view = boardWith([line("A", true), line("B", false), line("C", null), line("D")]);

    expect(view.sheets[0]?.lines.map((l) => [l.sku, l.madeToOrder])).toEqual([
      ["A", true],
      ["B", false],
      ["C", null],
      ["D", null],
    ]);
  });
});
