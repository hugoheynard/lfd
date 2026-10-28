import { instantToLocal } from "@lfd/contracts";

import type { SheetLine } from "../../entities/packing-sheet.snapshot.js";
import type { BoardOrder, BoardStock, PackingBoardDay } from "../../ports/packing-board.reader.js";
import { ovenWaitingOrdersOf } from "../oven-waiting-orders.js";
import { packingBoardOf } from "../packing-board.js";

// La journée est dérivée d'un instant fixe ; les heures `HH:mm` ne sont
// comparées qu'entre elles, jamais à l'horloge.
const NOW = new Date(0);
const TODAY = instantToLocal(NOW).day;
const DRAWN = new Date(-3_600_000);
const AT = new Date(-600_000);

function line(sku: string, quantity: number, packed = false): SheetLine {
  return {
    sku,
    productName: sku,
    quantity,
    saleUnit: "piece",
    packed: packed ? { at: AT, by: "s1", initials: "" } : null,
  };
}

function order(overrides: Partial<BoardOrder> & Pick<BoardOrder, "orderId">): BoardOrder {
  return {
    reference: `ORD-${overrides.orderId}`,
    rank: 1,
    customerLabel: "Le Bistrot",
    fulfillmentMethod: "pickup",
    clientele: null,
    siteId: null,
    dueAt: null,
    drawnAt: DRAWN,
    packed: null,
    containers: 0,
    containerMode: "counted",
    lines: [],
    containerList: [],
    shortfallReportedAt: null,
    ...overrides,
  };
}

function stock(sku: string, received: number): BoardStock {
  return { sku, received, returned: 0, packed: 0, sentToShop: 0, reserved: 0 };
}

function day(orders: readonly BoardOrder[], stocks: readonly BoardStock[]): PackingBoardDay {
  return { orders, withdrawn: [], stocks };
}

describe("ovenWaitingOrdersOf — ce qui attend le four, pour la fiche d'atelier", () => {
  it("compte une commande dont la ligne ouverte dépasse la réserve, avec son heure", () => {
    const waiting = ovenWaitingOrdersOf(
      TODAY,
      day([order({ orderId: "a", dueAt: "08:45", lines: [line("CRO", 12)] })], [stock("CRO", 6)]),
      new Map(),
    );

    expect(waiting.get("CRO")).toEqual({ count: 1, earliestHandover: "08:45" });
  });

  it("une réserve qui couvre, ou une ligne déjà au bac, n'attend rien", () => {
    const waiting = ovenWaitingOrdersOf(
      TODAY,
      day(
        [
          order({ orderId: "a", lines: [line("CRO", 6)] }),
          order({ orderId: "b", lines: [line("PAI", 4, true)] }),
        ],
        [stock("CRO", 6)],
      ),
      new Map(),
    );

    expect(waiting.size).toBe(0);
  });

  it("garde la plus proche heure, et une heure connue passe avant « aucune »", () => {
    const waiting = ovenWaitingOrdersOf(
      TODAY,
      day(
        [
          order({ orderId: "a", fulfillmentMethod: "delivery", lines: [line("CRO", 4)] }),
          order({ orderId: "b", dueAt: "10:00", lines: [line("CRO", 4)] }),
          order({ orderId: "c", lines: [line("CRO", 4)] }),
        ],
        [],
      ),
      new Map([["c", { day: TODAY, time: "07:30", via: "transfer" as const }]]),
    );

    expect(waiting.get("CRO")).toEqual({ count: 3, earliestHandover: "07:30" });
  });

  it("une commande sans aucune heure se dit `null`", () => {
    const waiting = ovenWaitingOrdersOf(
      TODAY,
      day([order({ orderId: "a", fulfillmentMethod: "delivery", lines: [line("CRO", 4)] })], []),
      new Map(),
    );

    expect(waiting.get("CRO")).toEqual({ count: 1, earliestHandover: null });
  });

  it("un reliquat (rang 2) ne compte pas deux fois sa commande", () => {
    const waiting = ovenWaitingOrdersOf(
      TODAY,
      day(
        [
          order({ orderId: "a", lines: [line("CRO", 4)] }),
          order({ orderId: "a", rank: 2, lines: [line("CRO", 2)] }),
        ],
        [],
      ),
      new Map(),
    );

    expect(waiting.get("CRO")?.count).toBe(1);
  });

  it("dit la même chose que la Supervision, ligne pour ligne", () => {
    const board = day(
      [
        order({ orderId: "a", lines: [line("CRO", 12), line("PAI", 2)] }),
        order({ orderId: "b", lines: [line("PAI", 3)] }),
      ],
      [stock("CRO", 6), stock("PAI", 10)],
    );

    const view = packingBoardOf({
      date: TODAY,
      day: board,
      now: NOW,
      destinationOf: () => "",
      authorName: () => null,
      heldOrders: new Set(),
      cold: { coldSkus: new Set(), isothermBinIds: new Set() },
      departures: new Map(),
    });
    const supervised = new Set(
      view.sheets.flatMap((sheet) =>
        sheet.lines.filter((one) => one.awaitingProduction).map((one) => one.sku),
      ),
    );

    expect(new Set(ovenWaitingOrdersOf(TODAY, board, new Map()).keys())).toEqual(supervised);
  });
});
