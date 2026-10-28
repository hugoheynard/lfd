import type { ProductionOrderSnapshot } from "../../../domain/entities/production-day.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { packingListFactsOf } from "../packing-list-facts.js";

/** Recopié dans le fait, jamais comparé à l'horloge. */
const DRAWN = new Date("2026-10-13T03:00:00.000Z");
const DAY = ServiceDay.of("2026-10-13");

function planned(rank: number): ProductionOrderSnapshot {
  return {
    packed: null,
    orderId: "ord_1",
    rank,
    reference: "ORD-0001",
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: null,
    siteId: null,
    sheetDetails: null,
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 2, saleUnit: "piece" }],
  };
}

describe("packingListFactsOf — la liste à coliser porte le rang de la ligne de plan (L3b)", () => {
  it("la commande reste sous sa clé ; le reliquat du même jour a la sienne, à son rang", () => {
    const facts = packingListFactsOf(DAY, [planned(1), planned(2)], DRAWN).map((event) =>
      event.durableFact(),
    );

    expect(facts.map((fact) => fact.key)).toEqual([
      `production.packing_list_drawn:${DAY.value}:ord_1`,
      `production.packing_list_drawn:${DAY.value}:ord_1:r2`,
    ]);
  });
});
