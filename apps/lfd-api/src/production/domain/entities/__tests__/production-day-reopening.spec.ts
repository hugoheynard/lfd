import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDayNotClosedError } from "../../errors/production-errors.js";
import {
  ReopenAfterBatchesError,
  ReopenAfterDispatchError,
  ReopenAfterPackingError,
} from "../../errors/reopening-errors.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import { type DownstreamProgress, ProductionDay } from "../production-day.js";

/**
 * La réouverture, éprouvée sur l'agrégat seul — sans Nest, sans base.
 * Les instants ne sont comparés qu'entre eux, jamais à l'horloge.
 */

const DAY = "2026-10-15";
const CLOSED = new Date("2026-10-14T17:00:00.000Z");
const RETAKEN = new Date("2026-10-14T18:00:00.000Z");
const REOPENED = new Date("2026-10-14T19:00:00.000Z");
const NOTHING: DownstreamProgress = { packingStarted: false, dispatchStarted: false };

function order(orderId: string): ProducibleOrder {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines: [{ sku: "PAI-SEI", productName: "Pain de seigle", quantity: 12 }],
  };
}

function closedDay(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([order("ord_1"), order("ord_2")], new Set<string>(), CLOSED, null);
  return day;
}

describe("ProductionDay.reopen", () => {
  it("défait l'arrêt, efface le plan et le retirage, et garde la trace", () => {
    const day = closedDay();
    day.retake([order("ord_1"), order("ord_2"), order("ord_3")], new Set(), RETAKEN, "s1", "A");

    const released = day.reopen(NOTHING, REOPENED, "staff-1");

    expect(released).toEqual(["ord_1", "ord_2", "ord_3"]);
    expect(day.isClosed).toBe(false);
    expect(day.toSnapshot()).toMatchObject({
      closedAt: null,
      closedBy: null,
      retaken: null,
      retakenByName: null,
      orders: [],
      counts: [],
      reopened: { at: REOPENED, by: "staff-1" },
    });
  });

  it("laisse la journée se ré-arrêter normalement, sur les commandes du moment", () => {
    const day = closedDay();
    day.reopen(NOTHING, REOPENED, "staff-1");

    day.close([order("ord_2"), order("ord_4")], new Set<string>(), RETAKEN, null);

    expect(day.orders.map((item) => item.orderId)).toEqual(["ord_2", "ord_4"]);
    expect(day.reopened).toEqual({ at: REOPENED, by: "staff-1" });
  });

  it("refuse une journée qui n'est pas arrêtée", () => {
    const day = ProductionDay.open(ServiceDay.of(DAY));
    expect(() => day.reopen(NOTHING, REOPENED, "staff-1")).toThrow(ProductionDayNotClosedError);
  });

  it("refuse dès qu'une fournée est déclarée, et ne touche à rien", () => {
    const day = closedDay();
    const recorded = { at: RETAKEN, by: "s1", initials: "" };
    const withBatch = ProductionDay.fromSnapshot({
      ...day.toSnapshot(),
      batches: [day.batchToRecord("b1", "PAI-SEI", 5, recorded)],
    });

    expect(() => withBatch.reopen(NOTHING, REOPENED, "s1")).toThrow(ReopenAfterBatchesError);
    expect(withBatch.isClosed).toBe(true);
    expect(withBatch.orders).toHaveLength(2);
  });

  it("admet une fournée annulée : elle n'a rien sorti du four", () => {
    const day = closedDay();
    const recorded = { at: RETAKEN, by: "s1", initials: "" };
    const batch = day.batchToRecord("b1", "PAI-SEI", 5, recorded);
    const cancelled = ProductionDay.fromSnapshot({
      ...day.toSnapshot(),
      batches: [{ ...batch, cancelled: { at: RETAKEN, by: "s1" } }],
    });

    expect(cancelled.reopen(NOTHING, REOPENED, "s1")).toHaveLength(2);
  });

  it("refuse une ligne cochée par l'ancien poste", () => {
    const snapshot = closedDay().toSnapshot();
    const ticked = ProductionDay.fromSnapshot({
      ...snapshot,
      counts: snapshot.counts.map((item) => ({
        ...item,
        done: { at: RETAKEN, by: "s1", initials: "AB" },
      })),
    });

    expect(() => ticked.reopen(NOTHING, REOPENED, "s1")).toThrow(ReopenAfterBatchesError);
  });

  it("refuse quand le colisage a commencé", () => {
    const progress = { packingStarted: true, dispatchStarted: false };
    expect(() => closedDay().reopen(progress, REOPENED, "s1")).toThrow(ReopenAfterPackingError);
  });

  it("refuse quand une tournée est chargée ou partie", () => {
    const progress = { packingStarted: false, dispatchStarted: true };
    expect(() => closedDay().reopen(progress, REOPENED, "s1")).toThrow(ReopenAfterDispatchError);
  });

  it("relit `reopened` absent comme jamais rouverte", () => {
    const { reopened: _ignored, ...legacy } = closedDay().toSnapshot();
    expect(ProductionDay.fromSnapshot(legacy).reopened).toBeNull();
  });
});
