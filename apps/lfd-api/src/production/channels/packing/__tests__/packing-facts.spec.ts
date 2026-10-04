import { HandedToPackingEvent, HandedToPackingPayloadError } from "../handed-to-packing.event.js";
import {
  PackingListDrawnEvent,
  PackingListDrawnPayloadError,
  type PackingListOrder,
} from "../packing-list-drawn.event.js";
import { ReturnRequestedEvent, ReturnRequestedPayloadError } from "../return-requested.event.js";

/**
 * Les trois faits du canal du colisage : un aller-retour par la charge utile
 * rend le même fait, et une charge hors contrat est refusée — jamais lue à moitié.
 *
 * Instants recopiés, jamais comparés à l'horloge.
 */
const AT = new Date("2026-09-13T05:10:00.000Z");
const DAY = "2026-09-13";

const ORDER: PackingListOrder = {
  orderId: "ord_1",
  reference: "CMD-0001",
  customerLabel: "Trois Ponts",
  fulfillmentMethod: "delivery",
  dueAt: "07:30",
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 12 }],
};

describe("PackingListDrawnEvent", () => {
  it("une clé par journée ET par commande", () => {
    expect(new PackingListDrawnEvent(DAY, AT, ORDER).durableFact().key).toBe(
      `production.packing_list_drawn:${DAY}:ord_1`,
    );
  });

  it("se relit à l'identique, échéance nulle comprise", () => {
    for (const order of [ORDER, { ...ORDER, dueAt: null }]) {
      const fact = new PackingListDrawnEvent(DAY, AT, order).durableFact();
      expect(PackingListDrawnEvent.fromPayload(fact.payload)).toEqual(
        new PackingListDrawnEvent(DAY, AT, order),
      );
    }
  });

  it.each([
    ["sans journée", { serviceDay: "" }],
    ["instant illisible", { drawnAt: "hier" }],
    ["mode inconnu", { order: { ...ORDER, fulfillmentMethod: "drone" } }],
    ["échéance non textuelle", { order: { ...ORDER, dueAt: 730 } }],
    ["quantité nulle", { order: { ...ORDER, lines: [{ ...ORDER.lines[0], quantity: 0 }] } }],
    ["lignes absentes", { order: { ...ORDER, lines: "VIE-001" } }],
    ["commande absente", { order: null }],
  ])("refuse une charge %s", (_label, override) => {
    const payload = {
      ...new PackingListDrawnEvent(DAY, AT, ORDER).durableFact().payload,
      ...override,
    };
    expect(() => PackingListDrawnEvent.fromPayload(payload)).toThrow(PackingListDrawnPayloadError);
  });
});

describe("HandedToPackingEvent", () => {
  const event = new HandedToPackingEvent("01K6A", DAY, "VIE-001", 12, AT);

  it("sa clé est la remise, et il se relit à l'identique", () => {
    const fact = event.durableFact();
    expect(fact.key).toBe("production.handed_to_packing:01K6A");
    expect(HandedToPackingEvent.fromPayload(fact.payload)).toEqual(event);
  });

  it.each([
    ["quantité négative", { quantity: -3 }],
    ["quantité fractionnaire", { quantity: 1.5 }],
    ["sans remise", { handoffId: "" }],
    ["sans article", { sku: 42 }],
  ])("refuse une charge %s", (_label, override) => {
    const payload = { ...event.durableFact().payload, ...override };
    expect(() => HandedToPackingEvent.fromPayload(payload)).toThrow(HandedToPackingPayloadError);
  });
});

describe("ReturnRequestedEvent", () => {
  const event = new ReturnRequestedEvent("return-01K6A", DAY, "VIE-001", 12, true, AT);

  it("sa clé est la demande, et il se relit à l'identique", () => {
    const fact = event.durableFact();
    expect(fact.key).toBe("production.return_requested:return-01K6A");
    expect(ReturnRequestedEvent.fromPayload(fact.payload)).toEqual(event);
  });

  it.each([
    ["régime absent", { legacy: "oui" }],
    ["quantité nulle", { quantity: 0 }],
    ["instant illisible", { requestedAt: 12 }],
  ])("refuse une charge %s", (_label, override) => {
    const payload = { ...event.durableFact().payload, ...override };
    expect(() => ReturnRequestedEvent.fromPayload(payload)).toThrow(ReturnRequestedPayloadError);
  });
});
