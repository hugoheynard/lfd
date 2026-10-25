import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedPackingStates } from "../../commands/__tests__/packing-state-doubles.js";
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
  reference: "ORD-0001",
  customerName: "Boulangerie du Col",
  fulfillmentMethod: "pickup",
  status: "ready",
  window: { start: "07:00", end: "08:00", source: "override" },
  shortfallReportedAt: null,
};

describe("GetDaySupervisionHandler", () => {
  it("lit le jour demandé et rend l'instant du Clock en `asOf`", async () => {
    const reader = new StubReader([], 0);
    const view = await new GetDaySupervisionHandler(
      reader,
      new FixedClock(NOW),
      new FixedPackingStates(),
    ).execute(new GetDaySupervisionQuery(DAY));

    expect(reader.days).toEqual([DAY]);
    expect(view.date).toBe(DAY);
    expect(view.asOf).toBe(NOW.toISOString());
  });

  it("sans jour demandé, lit le jour courant du Clock à l'heure de Paris", async () => {
    // 23 h 30 UTC le 10 novembre = 00 h 30 le 11 à Paris : l'UTC dirait la veille.
    const reader = new StubReader([], 0);
    const view = await new GetDaySupervisionHandler(
      reader,
      new FixedClock(new Date(`${DAY}T23:30:00.000Z`)),
      new FixedPackingStates(),
    ).execute(new GetDaySupervisionQuery());

    expect(reader.days).toEqual(["2026-11-11"]);
    expect(view.date).toBe("2026-11-11");
  });

  it("rend le compte des commandes sans date tel que le port le donne", async () => {
    const view = await new GetDaySupervisionHandler(
      new StubReader([], 3),
      new FixedClock(NOW),
      new FixedPackingStates(),
    ).execute(new GetDaySupervisionQuery(DAY));

    expect(view.undated).toBe(3);
  });

  it("rend les commandes au manque signalé — « décision attendue » (E6a)", async () => {
    const view = await new GetDaySupervisionHandler(
      new StubReader(
        [LATE, { ...LATE, orderId: "o2", reference: "ORD-0002", shortfallReportedAt: NOW }],
        0,
      ),
      new FixedClock(NOW),
      new FixedPackingStates(),
    ).execute(new GetDaySupervisionQuery(DAY));

    expect(view.awaitingDecision).toEqual([
      {
        orderId: "o2",
        reference: "ORD-0002",
        customerName: "Boulangerie du Col",
        fulfillmentMethod: "pickup",
        reportedAt: NOW.toISOString(),
      },
    ]);
  });

  it("projette un retard sans rien ajouter à la commande", async () => {
    const view = await new GetDaySupervisionHandler(
      new StubReader([LATE], 0),
      new FixedClock(NOW),
      new FixedPackingStates(),
    ).execute(new GetDaySupervisionQuery(DAY));

    expect(view.late).toEqual([
      {
        orderId: "o1",
        reference: "ORD-0001",
        customerName: "Boulangerie du Col",
        fulfillmentMethod: "pickup",
        window: { start: "07:00", end: "08:00", source: "override" },
        stage: "ready",
        rule: "not_handed_over_after_window",
      },
    ]);
  });

  it("plan A1 : compte à part les annulées dont le colisage a retiré la feuille", async () => {
    const cancelled: SupervisedOrder = { ...LATE, status: "cancelled", window: null };
    const packing = new FixedPackingStates({ o1: "withdrawn", o9: "packed" });
    const view = await new GetDaySupervisionHandler(
      new StubReader([cancelled, { ...LATE, orderId: "o9" }], 0),
      new FixedClock(NOW),
      packing,
    ).execute(new GetDaySupervisionQuery(DAY));

    expect(view.flow[0]).toMatchObject({ cancelled: 1, cancelledAfterPlan: 1 });
    // Seules les annulées sont demandées au colisage.
    expect(packing.asked).toEqual([["o1"]]);
  });
});
