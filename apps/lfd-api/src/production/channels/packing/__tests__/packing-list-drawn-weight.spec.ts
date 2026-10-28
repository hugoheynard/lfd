import {
  PackingListDrawnEvent,
  PackingListDrawnPayloadError,
  type PackingListOrder,
} from "../packing-list-drawn.event.js";

/**
 * **La liste à coliser porte l'unité de chaque ligne** (plan
 * `documentation/pricing/vente-au-poids.md`, P6). Additive : un fait
 * écrit avant le champ se relit à la pièce ; une unité inconnue est refusée
 * plutôt que lue en pièces.
 *
 * Instants recopiés, jamais comparés à l'horloge.
 */
const AT = new Date("2026-09-13T05:10:00.000Z");
const DAY = "2026-09-13";

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
    { sku: "VIE-001", productName: "Croissant", quantity: 12, saleUnit: "piece" },
    { sku: "TRA-SAU", productName: "Saumon gravlax", quantity: 1250, saleUnit: "weight" },
  ],
};

function payloadWith(lines: readonly Record<string, unknown>[]): Record<string, unknown> {
  const { payload } = new PackingListDrawnEvent(DAY, AT, ORDER).durableFact();
  return { ...payload, order: { ...ORDER, lines } };
}

describe("PackingListDrawnEvent — au poids", () => {
  it("fait l'aller-retour d'une commande mêlée, unité comprise", () => {
    const { payload } = new PackingListDrawnEvent(DAY, AT, ORDER).durableFact();

    expect(PackingListDrawnEvent.fromPayload(payload).order.lines).toEqual(ORDER.lines);
  });

  it("relit à la pièce une ligne écrite avant le champ (rétrocompatibilité)", () => {
    const event = PackingListDrawnEvent.fromPayload(
      payloadWith([{ sku: "VIE-001", productName: "Croissant", quantity: 12 }]),
    );

    expect(event.order.lines).toEqual([
      { sku: "VIE-001", productName: "Croissant", quantity: 12, saleUnit: "piece" },
    ]);
  });

  it("refuse une unité inconnue plutôt que de coliser des grammes un par un", () => {
    expect(() =>
      PackingListDrawnEvent.fromPayload(
        payloadWith([{ sku: "TRA-SAU", productName: "Saumon", quantity: 1250, saleUnit: "kg" }]),
      ),
    ).toThrow(PackingListDrawnPayloadError);
  });

  it("refuse un poids non entier : des grammes restent des entiers", () => {
    expect(() =>
      PackingListDrawnEvent.fromPayload(
        payloadWith([
          { sku: "TRA-SAU", productName: "Saumon", quantity: 1.25, saleUnit: "weight" },
        ]),
      ),
    ).toThrow(PackingListDrawnPayloadError);
  });
});
