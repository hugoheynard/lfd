import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedPackingStates } from "../../commands/__tests__/packing-state-doubles.js";
import {
  DaySupervisionReader,
  type SupervisedOrder,
} from "../../../domain/ports/day-supervision.reader.js";
import { LateToleranceReader } from "../../../domain/ports/late-tolerance.reader.js";
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

/** La tolérance de retard, posée par le test (Hugo, 2026-11-03). */
class FixedLateTolerance extends LateToleranceReader {
  constructor(private readonly minutes: number) {
    super();
  }

  lateToleranceMinutes(): Promise<number> {
    return Promise.resolve(this.minutes);
  }
}

const LATE: SupervisedOrder = {
  orderId: "o1",
  reference: "ORD-0001",
  customerName: "Boulangerie du Col",
  fulfillmentMethod: "pickup",
  status: "ready",
  supply: "planned",
  window: { start: "07:00", end: "08:00", source: "override" },
  shortfallReportedAt: null,
  shortfallLines: [],
};

describe("GetDaySupervisionHandler", () => {
  it("lit le jour demandé et rend l'instant du Clock en `asOf`", async () => {
    const reader = new StubReader([], 0);
    const view = await new GetDaySupervisionHandler(
      reader,
      new FixedClock(NOW),
      new FixedPackingStates(),
      new FixedLateTolerance(0),
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
      new FixedLateTolerance(0),
    ).execute(new GetDaySupervisionQuery());

    expect(reader.days).toEqual(["2026-11-11"]);
    expect(view.date).toBe("2026-11-11");
  });

  it("rend le compte des commandes sans date tel que le port le donne", async () => {
    const view = await new GetDaySupervisionHandler(
      new StubReader([], 3),
      new FixedClock(NOW),
      new FixedPackingStates(),
      new FixedLateTolerance(0),
    ).execute(new GetDaySupervisionQuery(DAY));

    expect(view.undated).toBe(3);
  });

  it("rend les commandes au manque signalé — « décision attendue » (E6a)", async () => {
    const view = await new GetDaySupervisionHandler(
      new StubReader(
        [
          LATE,
          {
            ...LATE,
            orderId: "o2",
            reference: "ORD-0002",
            shortfallReportedAt: NOW,
            shortfallLines: [
              { sku: "CRO", productName: "Croissant", due: 3, packed: 1, saleUnit: "piece" },
            ],
          },
        ],
        0,
      ),
      new FixedClock(NOW),
      new FixedPackingStates(),
      new FixedLateTolerance(0),
    ).execute(new GetDaySupervisionQuery(DAY));

    expect(view.awaitingDecision).toEqual([
      {
        orderId: "o2",
        reference: "ORD-0002",
        customerName: "Boulangerie du Col",
        fulfillmentMethod: "pickup",
        supply: "planned",
        reportedAt: NOW.toISOString(),
        lines: [{ sku: "CRO", productName: "Croissant", due: 3, packed: 1, saleUnit: "piece" }],
      },
    ]);
  });

  it("projette un retard sans rien ajouter à la commande", async () => {
    const view = await new GetDaySupervisionHandler(
      new StubReader([LATE], 0),
      new FixedClock(NOW),
      new FixedPackingStates(),
      new FixedLateTolerance(0),
    ).execute(new GetDaySupervisionQuery(DAY));

    expect(view.late).toEqual([
      {
        orderId: "o1",
        reference: "ORD-0001",
        customerName: "Boulangerie du Col",
        fulfillmentMethod: "pickup",
        supply: "planned",
        window: { start: "07:00", end: "08:00", source: "override" },
        stage: "ready",
        rule: "not_handed_over_after_window",
      },
    ]);
  });

  it("porte la marque « sur stock » d'une commande prise en vitrine (lot L6)", async () => {
    const view = await new GetDaySupervisionHandler(
      new StubReader([{ ...LATE, supply: "shelf" }], 0),
      new FixedClock(NOW),
      new FixedPackingStates(),
      new FixedLateTolerance(0),
    ).execute(new GetDaySupervisionQuery(DAY));

    expect(view.late.map((late) => late.supply)).toEqual(["shelf"]);
  });

  /**
   * Régression (2026-11-02) : une commande sur stock À L'HEURE ne montrait pas
   * « Sur stock » en Supervision — la marque n'était servie que dans `late`.
   */
  it("liste toutes les commandes du jour prises sur stock, en retard ou non", async () => {
    const onTime: SupervisedOrder = {
      ...LATE,
      orderId: "o2",
      reference: "ORD-0002",
      supply: "shelf",
      status: "placed",
      window: { start: "18:00", end: "19:00", source: "override" },
    };
    const view = await new GetDaySupervisionHandler(
      new StubReader([LATE, onTime], 0),
      new FixedClock(NOW),
      new FixedPackingStates(),
      new FixedLateTolerance(0),
    ).execute(new GetDaySupervisionQuery(DAY));

    expect(view.late.map((late) => late.orderId)).toEqual(["o1"]);
    expect(view.shelfOrderIds).toEqual(["o2"]);
  });

  it("plan A1 : compte à part les annulées dont le colisage a retiré la feuille", async () => {
    const cancelled: SupervisedOrder = { ...LATE, status: "cancelled", window: null };
    const packing = new FixedPackingStates({ o1: "withdrawn", o9: "packed" });
    const view = await new GetDaySupervisionHandler(
      new StubReader([cancelled, { ...LATE, orderId: "o9" }], 0),
      new FixedClock(NOW),
      packing,
      new FixedLateTolerance(0),
    ).execute(new GetDaySupervisionQuery(DAY));

    expect(view.flow[0]).toMatchObject({ cancelled: 1, cancelledAfterPlan: 1 });
    // Seules les annulées sont demandées au colisage.
    expect(packing.asked).toEqual([["o1"]]);
  });

  it("applique la tolérance de retard lue au réglage (Hugo, 2026-11-03)", async () => {
    // NOW = 10 h à Paris, fin du créneau 8 h : deux heures après.
    const within = await new GetDaySupervisionHandler(
      new StubReader([LATE], 0),
      new FixedClock(NOW),
      new FixedPackingStates(),
      new FixedLateTolerance(120),
    ).execute(new GetDaySupervisionQuery(DAY));
    const beyond = await new GetDaySupervisionHandler(
      new StubReader([LATE], 0),
      new FixedClock(NOW),
      new FixedPackingStates(),
      new FixedLateTolerance(119),
    ).execute(new GetDaySupervisionQuery(DAY));

    expect(within.late).toEqual([]);
    expect(beyond.late.map((late) => late.orderId)).toEqual(["o1"]);
  });
});
