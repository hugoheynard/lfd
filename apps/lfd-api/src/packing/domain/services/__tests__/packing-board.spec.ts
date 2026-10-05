import { addDays, instantToLocal } from "@lfd/contracts";

import type { SheetLine } from "../../entities/packing-sheet.snapshot.js";
import type { BoardOrder, PackingBoardDay } from "../../ports/packing-board.reader.js";
import { packingBoardOf, type BoardSources } from "../packing-board.js";

// L'instant du serveur, et la journée lue par rapport à LUI — jamais au mur.
const NOW = new Date(0);
const TODAY = instantToLocal(NOW).day;
const CLOSED = new Date(-3_600_000);
const RETAKEN = new Date(-1_800_000);
const AT = new Date(-600_000);

function line(sku: string, quantity: number, packed = false, name = sku): SheetLine {
  return {
    sku,
    productName: name,
    quantity,
    packed: packed ? { at: AT, by: "s1", initials: "" } : null,
  };
}

function order(overrides: Partial<BoardOrder> & Pick<BoardOrder, "orderId">): BoardOrder {
  return {
    reference: `CMD-${overrides.orderId}`,
    customerLabel: "Le Bistrot",
    fulfillmentMethod: "delivery",
    drawnAt: CLOSED,
    packed: null,
    containers: 0,
    containerMode: "listed",
    lines: [],
    containerList: [],
    ...overrides,
  };
}

function sources(day: PackingBoardDay, overrides: Partial<BoardSources> = {}): BoardSources {
  return {
    date: TODAY,
    day,
    now: NOW,
    destinationOf: (orderId) => `Adresse ${orderId}`,
    authorName: (reference) => (reference === "s1" ? "Marie Boulanger" : null),
    heldOrders: new Set(),
    ...overrides,
  };
}

describe("packingBoardOf — le poste servi par le colisage (K3a)", () => {
  it("une journée dont la liste n'est pas arrivée se lit « plan non arrêté », sans lever", () => {
    const view = packingBoardOf(sources({ orders: [], stocks: [] }));

    expect(view).toEqual({
      date: TODAY,
      closedAt: null,
      sheets: [],
      resources: [],
      orderCount: 0,
      todoCount: 0,
      readyCount: 0,
      relativeDay: "today",
    });
  });

  it("l'heure de clôture est le PREMIER tirage reçu, pas celui d'un retirage", () => {
    const view = packingBoardOf(
      sources({
        orders: [
          order({ orderId: "b", drawnAt: RETAKEN }),
          order({ orderId: "a", drawnAt: CLOSED }),
        ],
        stocks: [],
      }),
    );

    expect(view.closedAt).toBe(CLOSED.toISOString());
  });

  it("range les bacs par référence et compte les piles", () => {
    const view = packingBoardOf(
      sources({
        orders: [
          order({ orderId: "2", lines: [line("CRO", 1)] }),
          order({ orderId: "1", lines: [line("CRO", 1, true)], packed: { at: AT, by: "s1" } }),
        ],
        stocks: [],
      }),
    );

    expect(view.sheets.map((sheet) => sheet.reference)).toEqual(["CMD-1", "CMD-2"]);
    expect(view).toMatchObject({ orderCount: 2, todoCount: 1, readyCount: 1 });
  });

  it("pose la destination, l'auteur nommé et la retenue que le handler a résolus", () => {
    const view = packingBoardOf(
      sources(
        {
          orders: [
            order({ orderId: "1", packed: { at: AT, by: "s1" }, lines: [line("CRO", 1, true)] }),
          ],
          stocks: [],
        },
        { heldOrders: new Set(["1"]) },
      ),
    );

    expect(view.sheets[0]).toMatchObject({
      destination: "Adresse 1",
      packedAt: AT.toISOString(),
      packedBy: "s1",
      packedByName: "Marie Boulanger",
      qualityHeld: true,
      canDeclareReady: false,
    });
  });

  it("« Déclarer prête » : toutes les lignes au bac, une au moins, pas déjà fermée, `listed`", () => {
    const full = [line("CRO", 1, true), line("PAI", 1, true)];
    const view = packingBoardOf(
      sources({
        orders: [
          order({ orderId: "1", lines: full }),
          order({ orderId: "2", lines: [line("CRO", 1, true), line("PAI", 1)] }),
          order({ orderId: "3", lines: [] }),
          // Colisée avec l'ancien poste : lecture seule (K3c, §17.6), même pleine.
          order({ orderId: "4", lines: full, containerMode: "counted" }),
        ],
        stocks: [],
      }),
    );

    expect(view.sheets.map((sheet) => sheet.canDeclareReady)).toEqual([true, false, false, false]);
  });

  it("listed : répartie = la somme sur les contenants vivants ; « À répartir » le reste", () => {
    const view = packingBoardOf(
      sources({
        orders: [
          order({
            orderId: "1",
            containers: 1,
            lines: [line("CRO", 10, false, "Croissant")],
            containerList: [
              {
                id: "ctn_1",
                nature: "bin",
                label: "AB12",
                bin: { binId: "bin_1", code: "AB12", half: "left" },
                lines: [{ sku: "CRO", quantity: 6 }],
              },
            ],
          }),
        ],
        stocks: [{ sku: "CRO", received: 10, returned: 0, packed: 6 }],
      }),
    );

    const sheet = view.sheets[0];
    expect(sheet?.lines[0]).toMatchObject({ allocated: 6, unallocated: 4 });
    expect(sheet?.containerMode).toBe("listed");
    expect(sheet?.containerList).toEqual([
      {
        id: "ctn_1",
        nature: "bin",
        label: "AB12",
        binId: "bin_1",
        binCode: "AB12",
        binHalf: "left",
        lines: [{ sku: "CRO", productName: "Croissant", quantity: 6 }],
        pieces: 6,
      },
    ]);
  });

  it("counted : la ligne cochée est répartie entière, et aucun contenant n'est listé", () => {
    const view = packingBoardOf(
      sources({
        orders: [
          order({
            orderId: "1",
            containerMode: "counted",
            containers: 3,
            lines: [line("CRO", 5, true), line("PAI", 2)],
          }),
        ],
        stocks: [],
      }),
    );

    expect(view.sheets[0]?.containers).toBe(3);
    expect(view.sheets[0]?.containerList).toEqual([]);
    expect(view.sheets[0]?.lines.map((l) => [l.sku, l.allocated, l.unallocated])).toEqual([
      ["CRO", 5, 0],
      ["PAI", 0, 2],
    ]);
  });

  it("🔴 une ligne ouverte attend le four tant que la réserve ne la couvre pas", () => {
    const view = packingBoardOf(
      sources({
        orders: [order({ orderId: "1", lines: [line("CRO", 5), line("PAI", 2)] })],
        stocks: [
          { sku: "CRO", received: 6, returned: 2, packed: 0 },
          { sku: "PAI", received: 2, returned: 0, packed: 0 },
        ],
      }),
    );

    expect(view.sheets[0]?.lines.map((l) => [l.sku, l.awaitingProduction])).toEqual([
      ["CRO", true],
      ["PAI", false],
    ]);
  });

  it("la balance : compte = dû de la liste, pris = au bac ; un reste négatif reste visible", () => {
    const view = packingBoardOf(
      sources({
        orders: [
          order({ orderId: "1", lines: [line("CRO", 4, true, "Croissant")] }),
          order({ orderId: "2", lines: [line("CRO", 3, false, "Croissant")] }),
        ],
        stocks: [{ sku: "CRO", received: 7, returned: 0, packed: 4 }],
      }),
    );

    expect(view.resources).toEqual([
      {
        sku: "CRO",
        productName: "Croissant",
        produced: 7,
        allocated: 4,
        remaining: 3,
        awaitingProduction: false,
        exhausted: false,
      },
    ]);
  });

  it("dit « demain » d'après l'instant du serveur", () => {
    const view = packingBoardOf(sources({ orders: [], stocks: [] }, { date: addDays(TODAY, 1) }));

    expect(view.relativeDay).toBe("tomorrow");
  });
});
