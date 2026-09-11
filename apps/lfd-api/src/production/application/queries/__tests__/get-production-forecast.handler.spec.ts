import type { ExpectedDayProduction } from "../../../channels/commerce/expected-production.reader.js";
import { ExpectedProductionReader } from "../../../channels/commerce/expected-production.reader.js";
import { ProductionPlanReader } from "../../../domain/ports/production-plan.reader.js";
import type { DayDemand } from "../../../domain/services/production-forecast.js";
import type { ServiceRange } from "../../../domain/value-objects/service-range.value-object.js";
import { GetProductionForecastHandler } from "../get-production-forecast.handler.js";
import { GetProductionForecastQuery } from "../get-production-forecast.query.js";

/** Le plan arrêté, doublé : il retient la plage qu'on lui a demandée. */
class PlanStub extends ProductionPlanReader {
  asked: ServiceRange | null = null;

  constructor(private readonly days: readonly DayDemand[]) {
    super();
  }

  arrestedBetween(range: ServiceRange): Promise<readonly DayDemand[]> {
    this.asked = range;
    return Promise.resolve(this.days);
  }
}

/** Le commerce, doublé. Même mémoire de la plage reçue. */
class ExpectedStub extends ExpectedProductionReader {
  asked: ServiceRange | null = null;

  constructor(private readonly days: readonly ExpectedDayProduction[]) {
    super();
  }

  expectedBetween(range: ServiceRange): Promise<readonly ExpectedDayProduction[]> {
    this.asked = range;
    return Promise.resolve(this.days);
  }
}

describe("GetProductionForecastHandler", () => {
  it("sert la matrice de la plage demandée, les deux sources arbitrées", async () => {
    const plan = new PlanStub([
      { day: "2026-09-03", items: [{ sku: "PAI-BAG", productName: "Baguette", quantity: 186 }] },
    ]);
    const expected = new ExpectedStub([
      { day: "2026-09-05", items: [{ sku: "PAI-BAG", productName: "Baguette", quantity: 410 }] },
    ]);

    const view = await new GetProductionForecastHandler(plan, expected).execute(
      new GetProductionForecastQuery("2026-09-03", "2026-09-05"),
    );

    expect(view.days).toEqual([
      { date: "2026-09-03", totalUnits: 186, closed: true },
      { date: "2026-09-04", totalUnits: 0, closed: false },
      { date: "2026-09-05", totalUnits: 410, closed: false },
    ]);
    expect(view.lines).toEqual([
      { sku: "PAI-BAG", productName: "Baguette", quantities: [186, 0, 410], totalUnits: 596 },
    ]);
    expect(view.peakDate).toBe("2026-09-05");
    expect(view.totalUnits).toBe(596);
  });

  it("interroge les DEUX sources sur la même plage", async () => {
    const plan = new PlanStub([]);
    const expected = new ExpectedStub([]);

    await new GetProductionForecastHandler(plan, expected).execute(
      new GetProductionForecastQuery("2026-09-03", "2026-09-09"),
    );

    expect(plan.asked?.days).toHaveLength(7);
    expect(expected.asked?.from.value).toBe("2026-09-03");
    expect(expected.asked?.to.value).toBe("2026-09-09");
  });

  it("refuse une plage à l'envers — le refus vient du domaine, pas de la route", async () => {
    const handler = new GetProductionForecastHandler(new PlanStub([]), new ExpectedStub([]));
    await expect(
      handler.execute(new GetProductionForecastQuery("2026-09-09", "2026-09-03")),
    ).rejects.toThrow(/précède/u);
  });
});
