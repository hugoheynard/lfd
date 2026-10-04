import type { ProductionBatchSnapshot } from "../../entities/production-day.snapshot.js";
import type { ProductionOrderSnapshot } from "../../entities/production-day.snapshot.js";
import { arrivalsBetween, handoffOf, returnOf, returnRequestIdOf } from "../production-handoff.js";

/** Instants recopiés, jamais comparés à l'horloge. */
const RECORDED = new Date("2026-09-13T05:10:00.000Z");
const CANCELLED = new Date("2026-09-13T06:00:00.000Z");

const BATCH: ProductionBatchSnapshot = {
  id: "01K6A",
  sku: "VIE-001",
  quantity: 12,
  recorded: { at: RECORDED, by: "staff-1", initials: "MB" },
  cancelled: null,
  returned: 0,
  pendingReturn: 0,
};

function sheet(orderId: string): ProductionOrderSnapshot {
  return {
    packed: null,
    containers: 0,
    orderId,
    reference: `CMD-${orderId}`,
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    lines: [],
  };
}

describe("la remise au colisage", () => {
  it("une remise porte l'id, la quantité et le geste de la fournée", () => {
    expect(handoffOf(BATCH)).toEqual({
      id: "01K6A",
      sku: "VIE-001",
      quantity: 12,
      source: "batch",
      at: RECORDED,
      by: "staff-1",
      requestId: null,
    });
  });

  it("un retour est une ligne de plus, négative, sous une demande déterministe", () => {
    expect(returnOf(BATCH, { at: CANCELLED, by: "staff-3" })).toEqual({
      id: "return-01K6A",
      sku: "VIE-001",
      quantity: -12,
      source: "batch",
      at: CANCELLED,
      by: "staff-3",
      requestId: "return-01K6A",
    });
    expect(returnRequestIdOf("01K6A")).toBe("return-01K6A");
  });

  it("les arrivées d'un retirage : celles qu'avant ne portait pas, par `orderId`", () => {
    const before = [sheet("a"), sheet("b")];
    expect(arrivalsBetween(before, [...before, sheet("c")])).toEqual([sheet("c")]);
    expect(arrivalsBetween(before, before)).toEqual([]);
    expect(arrivalsBetween([], [sheet("a")])).toEqual([sheet("a")]);
  });
});
