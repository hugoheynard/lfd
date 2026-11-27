import { PackingListDrawnEvent, type PackingListOrder } from "../packing-list-drawn.event.js";

/**
 * **La liste à coliser porte les options** (« dont 2 tranchés »,
 * `documentation/catalogue/plan-options-de-commande.md`, § 3.4). Additif :
 * un fait écrit avant le champ se relit sans option ; une forme illisible
 * est refusée, jamais relue « sans option ».
 *
 * Instants recopiés, jamais comparés à l'horloge.
 */
const AT = new Date("2026-11-27T05:10:00.000Z");
const DAY = "2026-11-28";

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
    {
      sku: "PAIN",
      productName: "Pain de campagne",
      quantity: 4,
      saleUnit: "piece",
      options: [{ groupName: "Tranchage", choiceLabel: "tranché", quantity: 2 }],
    },
    { sku: "BAG", productName: "Baguette", quantity: 10, saleUnit: "piece" },
  ],
};

describe("PackingListDrawnEvent — les options", () => {
  it("fait l'aller-retour des options ; une ligne sans option n'en porte pas", () => {
    const { payload } = new PackingListDrawnEvent(DAY, AT, ORDER).durableFact();

    expect(PackingListDrawnEvent.fromPayload(payload).order.lines).toEqual(ORDER.lines);
  });

  it("refuse une option illisible plutôt que de la relire « sans option »", () => {
    const { payload } = new PackingListDrawnEvent(DAY, AT, ORDER).durableFact();
    const broken = {
      ...payload,
      order: {
        ...ORDER,
        lines: [{ ...ORDER.lines[0], options: [{ groupName: "Tranchage", quantity: 2 }] }],
      },
    };

    expect(() => PackingListDrawnEvent.fromPayload(broken)).toThrow();
  });
});
