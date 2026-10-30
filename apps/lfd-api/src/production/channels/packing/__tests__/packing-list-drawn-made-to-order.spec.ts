import { PackingListDrawnEvent, type PackingListOrder } from "../packing-list-drawn.event.js";

/**
 * **La liste à coliser porte le marqueur « sur mesure »** (plan
 * `documentation/catalogue/plan-sur-mesure-partout.md`, M4). Additif : un
 * fait écrit avant le champ se relit sans lui — absent vaut « on ne savait
 * pas », jamais `false`.
 *
 * Instants recopiés, jamais comparés à l'horloge.
 */
const AT = new Date("2026-10-30T05:10:00.000Z");
const DAY = "2026-10-31";

const ORDER: PackingListOrder = {
  orderId: "ord_1",
  rank: 1,
  reference: "ORD-0001",
  customerLabel: "Trois Ponts",
  fulfillmentMethod: "pickup",
  dueAt: null,
  clientele: "pro",
  siteId: null,
  lines: [
    { sku: "GAT-001", productName: "Entremets", quantity: 1, saleUnit: "piece", madeToOrder: true },
    {
      sku: "VIE-001",
      productName: "Croissant",
      quantity: 12,
      saleUnit: "piece",
      madeToOrder: false,
    },
  ],
};

describe("PackingListDrawnEvent — sur mesure", () => {
  it("fait l'aller-retour du marqueur, `true` comme `false`", () => {
    const { payload } = new PackingListDrawnEvent(DAY, AT, ORDER).durableFact();

    expect(PackingListDrawnEvent.fromPayload(payload).order.lines).toEqual(ORDER.lines);
  });

  it("relit un fait ancien sans le champ : la ligne n'en dit rien", () => {
    const { payload } = new PackingListDrawnEvent(DAY, AT, ORDER).durableFact();
    const old = {
      ...payload,
      order: {
        ...ORDER,
        lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 12, saleUnit: "piece" }],
      },
    };

    const [line] = PackingListDrawnEvent.fromPayload(old).order.lines;

    expect(line).toEqual({
      sku: "VIE-001",
      productName: "Croissant",
      quantity: 12,
      saleUnit: "piece",
    });
    expect(line?.madeToOrder ?? null).toBeNull();
  });

  it("relit `null` écrit tel quel comme une absence, jamais comme `false`", () => {
    const { payload } = new PackingListDrawnEvent(DAY, AT, ORDER).durableFact();
    const unknown = {
      ...payload,
      order: {
        ...ORDER,
        lines: [
          {
            sku: "VIE-001",
            productName: "Croissant",
            quantity: 12,
            saleUnit: "piece",
            madeToOrder: null,
          },
        ],
      },
    };

    expect(PackingListDrawnEvent.fromPayload(unknown).order.lines[0]?.madeToOrder).toBeUndefined();
  });
});
