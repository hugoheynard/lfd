import { ArrestedPlanLinesReader, ServiceRange } from "../../../../day/index.js";
import { ArrestedProductionPlanReader } from "../arrested-production-plan.reader.js";

/**
 * Le prévisionnel lit les plans arrêtés au noyau et les regroupe par journée.
 * Les jours ne sont comparés qu'entre eux : aucune horloge n'intervient.
 */
type Line = Awaited<ReturnType<ArrestedPlanLinesReader["countLinesBetween"]>>[number];

class FixedPlanLines extends ArrestedPlanLinesReader {
  constructor(
    private readonly counts: readonly Line[],
    private readonly resupplies: readonly Line[],
    private readonly orders: ReadonlyMap<string, number>,
  ) {
    super();
  }

  countLinesBetween(): Promise<readonly Line[]> {
    return Promise.resolve(this.counts);
  }

  resupplyLinesBetween(): Promise<readonly Line[]> {
    return Promise.resolve(this.resupplies);
  }

  orderCountsBetween(): Promise<ReadonlyMap<string, number>> {
    return Promise.resolve(this.orders);
  }
}

const RANGE = ServiceRange.of("2026-03-02", "2026-03-08");
const D1 = "2026-03-02";
const D2 = "2026-03-03";

function line(serviceDay: string, sku: string, quantity: number, unit: "piece" | "weight"): Line {
  return { serviceDay, sku, productName: `Article ${sku}`, quantity, saleUnit: unit };
}

describe("ArrestedProductionPlanReader — le plan arrêté, regroupé par journée", () => {
  it("regroupe le compte par journée et y joint le nombre de feuilles", async () => {
    const reader = new ArrestedProductionPlanReader(
      new FixedPlanLines(
        [line(D1, "BAG", 10, "piece"), line(D1, "CRO", 4, "piece"), line(D2, "BAG", 2, "piece")],
        [],
        new Map([[D1, 3]]),
      ),
    );

    const days = await reader.arrestedBetween(RANGE);

    expect(days.map((day) => [day.day, day.items.map((i) => i.sku), day.orderCount])).toEqual([
      [D1, ["BAG", "CRO"], 3],
      [D2, ["BAG"], 0],
    ]);
  });

  it("cumule les réassorts par article et unité, jamais des grammes avec des pièces", async () => {
    const reader = new ArrestedProductionPlanReader(
      new FixedPlanLines(
        [],
        [line(D1, "BAG", 2, "piece"), line(D1, "BAG", 3, "piece"), line(D1, "BAG", 500, "weight")],
        new Map(),
      ),
    );

    const [day] = await reader.arrestedResuppliesBetween(RANGE);

    expect(day?.items.map((i) => [i.sku, i.saleUnit, i.quantity])).toEqual([
      ["BAG", "piece", 5],
      ["BAG", "weight", 500],
    ]);
  });
});
