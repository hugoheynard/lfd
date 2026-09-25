import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  DaySupervisionReader,
  type SupervisedOrder,
} from "../../../domain/ports/day-supervision.reader.js";
import { GetDaySupervisionHandler } from "../get-day-supervision.handler.js";
import { GetDaySupervisionQuery } from "../get-day-supervision.query.js";

/** Les dates ne sont comparées qu'entre elles : l'horloge est figée ici. */
const DAY = "2026-11-10";
const NOW = new Date(`${DAY}T09:00:00.000Z`);

class StubReader extends DaySupervisionReader {
  readonly days: string[] = [];

  constructor(
    private readonly orders: readonly SupervisedOrder[],
    private readonly undated: number,
  ) {
    super();
  }

  ordersOn(day: string): Promise<readonly SupervisedOrder[]> {
    this.days.push(day);
    return Promise.resolve(this.orders);
  }

  countUndated(): Promise<number> {
    return Promise.resolve(this.undated);
  }
}

const LATE: SupervisedOrder = {
  orderId: "o1",
  reference: "CMD-0001",
  customerName: "Boulangerie du Col",
  fulfillmentMethod: "pickup",
  status: "ready",
  window: { start: "07:00", end: "08:00", source: "override" },
};

describe("GetDaySupervisionHandler", () => {
  it("lit le jour demandé et rend l'instant du Clock en `asOf`", async () => {
    const reader = new StubReader([], 0);
    const view = await new GetDaySupervisionHandler(reader, new FixedClock(NOW)).execute(
      new GetDaySupervisionQuery(DAY),
    );

    expect(reader.days).toEqual([DAY]);
    expect(view.date).toBe(DAY);
    expect(view.asOf).toBe(NOW.toISOString());
  });

  it("rend le compte des commandes sans date tel que le port le donne", async () => {
    const view = await new GetDaySupervisionHandler(
      new StubReader([], 3),
      new FixedClock(NOW),
    ).execute(new GetDaySupervisionQuery(DAY));

    expect(view.undated).toBe(3);
  });

  it("projette un retard sans rien ajouter à la commande", async () => {
    const view = await new GetDaySupervisionHandler(
      new StubReader([LATE], 0),
      new FixedClock(NOW),
    ).execute(new GetDaySupervisionQuery(DAY));

    expect(view.late).toEqual([
      {
        orderId: "o1",
        reference: "CMD-0001",
        customerName: "Boulangerie du Col",
        fulfillmentMethod: "pickup",
        window: { start: "07:00", end: "08:00", source: "override" },
        stage: "ready",
        rule: "not_handed_over_after_window",
      },
    ]);
  });
});
