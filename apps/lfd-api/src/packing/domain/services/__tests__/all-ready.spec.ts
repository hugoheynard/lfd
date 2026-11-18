import type { SheetLine } from "../../entities/packing-sheet.snapshot.js";
import type { BoardOrder } from "../../ports/packing-board.reader.js";
import { allReadyAvailable, allReadyShortages } from "../all-ready.js";
import { shortfall } from "../placement.js";

const CRO: SheetLine = {
  sku: "CRO",
  productName: "Croissant",
  quantity: 4,
  packed: null,
  saleUnit: "piece",
};
const PAC: SheetLine = {
  sku: "PAC",
  productName: "Pain au chocolat",
  quantity: 2,
  packed: null,
  saleUnit: "piece",
};

function freeOf(free: Record<string, number>): (sku: string) => number {
  return (sku) => free[sku] ?? 0;
}

describe("allReadyShortages — ce qui empêche « Tout est prêt »", () => {
  it("rien quand le libre couvre chaque reste", () => {
    expect(allReadyShortages([CRO, PAC], () => 0, freeOf({ CRO: 4, PAC: 2 }))).toEqual([]);
  });

  it("nomme chaque produit et ce qu'il manque au libre", () => {
    expect(allReadyShortages([CRO, PAC], () => 0, freeOf({ CRO: 1 }))).toEqual([
      { sku: "CRO", productName: "Croissant", saleUnit: "piece", missing: 3 },
      { sku: "PAC", productName: "Pain au chocolat", saleUnit: "piece", missing: 2 },
    ]);
  });

  it("ce qui est déjà au sac n'est plus demandé au libre", () => {
    expect(allReadyShortages([CRO], () => 3, freeOf({ CRO: 1 }))).toEqual([]);
  });
});

const MARK = { at: new Date(0), by: "s1" };

function order(overrides: Partial<BoardOrder> = {}): BoardOrder {
  return {
    orderId: "ord_1",
    rank: 1,
    reference: "ORD-0001",
    customerLabel: "Client",
    fulfillmentMethod: "pickup",
    clientele: "pro",
    siteId: null,
    dueAt: null,
    drawnAt: MARK.at,
    packed: null,
    containers: 0,
    containerMode: "listed",
    lines: [CRO],
    containerList: [],
    shortfallReportedAt: null,
    ...overrides,
  };
}

const awaitingWith = (free: Record<string, number>) => (sku: string, quantity: number) =>
  shortfall(free[sku] ?? 0, quantity) > 0;

describe("allReadyAvailable — le bouton du poste", () => {
  it("vrai quand la réserve libre couvre tout ce qui reste", () => {
    expect(allReadyAvailable(order(), awaitingWith({ CRO: 4 }))).toBe(true);
  });

  it("faux quand le four n'a pas tout remis", () => {
    expect(allReadyAvailable(order(), awaitingWith({ CRO: 3 }))).toBe(false);
  });

  it("compte ce qui est déjà au sac", () => {
    const bag = {
      id: "b1",
      nature: "bag" as const,
      label: "Sac 1",
      bin: null,
      lines: [{ sku: "CRO", quantity: 3 }],
    };
    expect(allReadyAvailable(order({ containerList: [bag] }), awaitingWith({ CRO: 1 }))).toBe(true);
  });

  it("faux sur une fiche fermée, vide ou de l'ancien poste", () => {
    const free = awaitingWith({ CRO: 10 });
    expect(allReadyAvailable(order({ packed: MARK }), free)).toBe(false);
    expect(allReadyAvailable(order({ lines: [] }), free)).toBe(false);
    expect(allReadyAvailable(order({ containerMode: "counted" }), free)).toBe(false);
  });
});
