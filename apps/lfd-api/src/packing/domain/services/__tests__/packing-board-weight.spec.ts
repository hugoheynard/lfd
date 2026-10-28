import { instantToLocal } from "@lfd/contracts";

import type { SheetLine } from "../../entities/packing-sheet.snapshot.js";
import type { BoardOrder, PackingBoardDay } from "../../ports/packing-board.reader.js";
import { packingBoardOf, type BoardSources } from "../packing-board.js";

/**
 * **Le poste de colisage, au poids** (plan `documentation/pricing/vente-au-poids.md`,
 * P6) : une ligne au poids garde son unité jusqu'à l'écran, et pèse UNE pièce
 * dans les compteurs du bac.
 *
 * Instants relatifs à `NOW`, recopiés, jamais comparés à l'horloge réelle.
 */
const NOW = new Date(0);
const TODAY = instantToLocal(NOW).day;
const CLOSED = new Date(-3_600_000);

const line = (sku: string, quantity: number, saleUnit: "piece" | "weight"): SheetLine => ({
  sku,
  productName: sku,
  quantity,
  saleUnit,
  packed: null,
});

function order(
  lines: readonly SheetLine[],
  held: readonly { readonly sku: string; readonly quantity: number }[],
): BoardOrder {
  return {
    orderId: "ord_1",
    reference: "ORD-1",
    rank: 1,
    customerLabel: "Le Bistrot",
    fulfillmentMethod: "pickup",
    clientele: null,
    siteId: null,
    dueAt: null,
    drawnAt: CLOSED,
    packed: null,
    containers: 1,
    containerMode: "listed",
    lines,
    containerList: [{ id: "c_1", nature: "bag", label: "Sac 1", bin: null, lines: held }],
    shortfallReportedAt: null,
  };
}

function boardOf(target: BoardOrder) {
  const day: PackingBoardDay = {
    orders: [target],
    withdrawn: [],
    stocks: [
      { sku: "CRO", received: 12, returned: 0, packed: 0, sentToShop: 0, reserved: 0 },
      { sku: "SAU", received: 1250, returned: 0, packed: 0, sentToShop: 0, reserved: 0 },
    ],
  };
  const sources: BoardSources = {
    date: TODAY,
    day,
    now: NOW,
    destinationOf: () => "Le Labo",
    authorName: () => null,
    heldOrders: new Set(),
    cold: { coldSkus: new Set(), isothermBinIds: new Set() },
    departures: new Map(),
  };
  return packingBoardOf(sources).sheets[0];
}

describe("packingBoardOf — une commande mêlée pièce et poids", () => {
  it("compte 12 croissants et UN saumon : 13 pièces, jamais 1 262", () => {
    const sheet = boardOf(order([line("CRO", 12, "piece"), line("SAU", 1250, "weight")], []));

    expect(sheet?.pieces).toBe(13);
    expect(sheet?.packedPieces).toBe(0);
  });

  it("sert l'unité de chaque ligne, avec le dû, le posé et le reste en grammes", () => {
    const sheet = boardOf(
      order(
        [line("CRO", 12, "piece"), line("SAU", 1250, "weight")],
        [{ sku: "SAU", quantity: 1000 }],
      ),
    );

    expect(sheet?.lines.find((l) => l.sku === "SAU")).toMatchObject({
      saleUnit: "weight",
      quantity: 1250,
      allocated: 1000,
      unallocated: 250,
    });
    expect(sheet?.lines.find((l) => l.sku === "CRO")).toMatchObject({ saleUnit: "piece" });
  });

  it("un lot au poids partiel ne compte pas encore sa pièce posée ; entier, il la compte", () => {
    const lines = [line("CRO", 12, "piece"), line("SAU", 1250, "weight")];

    expect(boardOf(order(lines, [{ sku: "SAU", quantity: 1000 }]))?.packedPieces).toBe(0);
    expect(
      boardOf(
        order(lines, [
          { sku: "SAU", quantity: 1250 },
          { sku: "CRO", quantity: 5 },
        ]),
      )?.packedPieces,
    ).toBe(6);
  });

  it("dit l'unité du lot dans son contenant, et le compte pour une pièce", () => {
    const sheet = boardOf(
      order(
        [line("CRO", 12, "piece"), line("SAU", 1250, "weight")],
        [
          { sku: "SAU", quantity: 1250 },
          { sku: "CRO", quantity: 4 },
        ],
      ),
    );

    expect(sheet?.containerList?.[0]).toMatchObject({
      lines: [
        { sku: "SAU", quantity: 1250, saleUnit: "weight" },
        { sku: "CRO", quantity: 4, saleUnit: "piece" },
      ],
      pieces: 5,
    });
  });
});
