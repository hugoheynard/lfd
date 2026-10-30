import {
  PackingListDrawnEvent,
  type PackingListLine,
} from "../../../../production/channels/packing/index.js";
import { InMemoryShadow } from "../../__tests__/shadow-doubles.js";
import { OnPackingListDrawn } from "../on-packing-list-drawn.handler.js";

/**
 * Plan sur mesure, M4 : le marqueur que le fait porte par ligne entre dans
 * l'ombre ; un fait publié sans lui n'en invente pas. Instant recopié, jamais
 * comparé à l'horloge.
 */
const AT = new Date(0);
const DAY = "1970-01-01";

type FactLine = PackingListLine;

function delivered(lines: readonly FactLine[]) {
  const fact = new PackingListDrawnEvent(DAY, AT, {
    orderId: "ord_1",
    rank: 1,
    reference: "ORD-1",
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    dueAt: null,
    clientele: null,
    siteId: null,
    lines,
  }).durableFact();
  return { eventId: "evt", type: fact.type, payload: fact.payload };
}

async function drawnLines(lines: readonly FactLine[]) {
  const shadow = new InMemoryShadow();
  await new OnPackingListDrawn(shadow).handle(delivered(lines));
  return [...shadow.orders.values()][0]?.lines ?? [];
}

describe("OnPackingListDrawn — le marqueur « sur mesure » (M4)", () => {
  it("recopie le marqueur de chaque ligne", async () => {
    const lines = await drawnLines([
      { sku: "GAT", productName: "Entremets", quantity: 1, saleUnit: "piece", madeToOrder: true },
      { sku: "CRO", productName: "Croissant", quantity: 2, saleUnit: "piece", madeToOrder: false },
    ]);

    expect(lines.map((line) => [line.sku, line.madeToOrder])).toEqual([
      ["GAT", true],
      ["CRO", false],
    ]);
  });

  it("n'invente rien pour un fait publié sans le champ", async () => {
    const lines = await drawnLines([
      { sku: "CRO", productName: "Croissant", quantity: 2, saleUnit: "piece" },
    ]);

    expect(lines[0]?.madeToOrder ?? null).toBeNull();
  });

  it("une ligne sur mesure d'un même article fait la ligne sur mesure", async () => {
    const lines = await drawnLines([
      { sku: "GAT", productName: "Entremets", quantity: 1, saleUnit: "piece", madeToOrder: false },
      { sku: "GAT", productName: "Entremets", quantity: 1, saleUnit: "piece", madeToOrder: true },
    ]);

    expect(lines).toEqual([
      { sku: "GAT", productName: "Entremets", quantity: 2, saleUnit: "piece", madeToOrder: true },
    ]);
  });
});
