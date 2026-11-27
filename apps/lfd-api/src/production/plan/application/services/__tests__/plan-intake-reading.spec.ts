import { producibleOrder } from "../../../../channels/commerce/__tests__/producible-order.fixture.js";
import { ProductionDay } from "../../../../day/domain/entities/production-day.js";
import { ServiceDay } from "../../../../day/index.js";
import { FixedDayOrders } from "../../../../channels/commerce/__tests__/day-orders-doubles.js";
import { intakeReadingOf } from "../../__tests__/plan-intake-doubles.js";
import { SavedDays } from "../../../../day/application/__tests__/revision-desk-doubles.js";
import { DayResupplies } from "../../../../channels/commerce/__tests__/day-resupplies-doubles.js";
import { InMemoryWithdrawals } from "../../../../day/application/__tests__/withdrawal-doubles.js";
import { FixedReopenRelease } from "../../../../channels/commerce/__tests__/reopen-release-doubles.js";
import { ReopenReleasePendingError } from "../../../domain/errors/reopen-release-errors.js";

/** `PlanIntakeReading` — ce que l'arrêt et le retirage lisent sous le verrou, et dans quel ordre. */
const DAY = ServiceDay.of("2026-09-08");
/** Recopié dans le retrait, jamais comparé à l'horloge. */
const AT = new Date("2026-09-07T18:00:00.000Z");

function scene() {
  const trace: string[] = [];
  const withdrawals = new InMemoryWithdrawals(trace);
  withdrawals.rows.set("ord_2", { day: DAY.value, at: AT, afterInscription: false });
  const reading = intakeReadingOf({
    days: new SavedDays(ProductionDay.open(DAY), trace),
    orders: new FixedDayOrders([producibleOrder(), producibleOrder("ord_2")], trace),
    withdrawals,
    resupplies: new DayResupplies([], trace),
  });
  return { reading, trace };
}

describe("lire ce que l'arrêt fige", () => {
  it("lit les retraits, puis les réassorts « pour demain », puis les commandes", async () => {
    const { reading, trace } = scene();

    const intake = await reading.arrestUnderLock(DAY, ProductionDay.open(DAY));

    expect(trace).toEqual([
      `withdrawals:${DAY.value}`,
      `resupplies:${DAY.value}`,
      `orders:${DAY.value}`,
    ]);
    expect([...intake.withdrawn]).toEqual(["ord_2"]);
    expect(intake.producible.map((order) => order.orderId)).toEqual(["ord_1", "ord_2"]);
    expect(intake.resupplies).toEqual([]);
  });
});

describe("lire ce que l'arrêt fige, après une réouverture", () => {
  /** Arrêtée à `AT`, puis rouverte : l'arrêt défait est celui de `AT`. */
  function reopened(): ProductionDay {
    const day = ProductionDay.open(DAY);
    day.close([producibleOrder()], new Set<string>(), AT, null);
    day.reopen({ packingStarted: false, dispatchStarted: false }, AT, "staff-1");
    return day;
  }

  it("refuse AVANT toute lecture tant que la remise du commerce est en attente", async () => {
    const trace: string[] = [];
    const releases = new FixedReopenRelease(true);
    const reading = intakeReadingOf({
      days: new SavedDays(ProductionDay.open(DAY), trace),
      orders: new FixedDayOrders([producibleOrder()], trace),
      withdrawals: new InMemoryWithdrawals(trace),
      resupplies: new DayResupplies([], trace),
      releases,
    });

    await expect(reading.arrestUnderLock(DAY, reopened())).rejects.toThrow(
      ReopenReleasePendingError,
    );
    expect(releases.asked).toEqual([{ day: DAY.value, undoneClosedAt: AT }]);
    expect(trace).toEqual([]);
  });

  it("lit comme d'habitude une fois la remise faite", async () => {
    const releases = new FixedReopenRelease(false);
    const reading = intakeReadingOf({
      days: new SavedDays(ProductionDay.open(DAY)),
      orders: new FixedDayOrders([producibleOrder()]),
      releases,
    });

    const intake = await reading.arrestUnderLock(DAY, reopened());

    expect(intake.producible.map((order) => order.orderId)).toEqual(["ord_1"]);
    expect(releases.asked).toHaveLength(1);
  });
});

describe("lire ce que le retirage absorbe", () => {
  it("lit les retraits puis les commandes, et aucun réassort", async () => {
    const { reading, trace } = scene();

    const intake = await reading.retakeUnderLock(DAY);

    expect(trace).toEqual([`withdrawals:${DAY.value}`, `orders:${DAY.value}`]);
    expect("resupplies" in intake).toBe(false);
  });
});

describe("relire la journée", () => {
  it("recharge la journée par le dépôt", async () => {
    const { reading, trace } = scene();

    const day = await reading.dayUnderLock(DAY);

    expect(day.isClosed).toBe(false);
    expect(trace).toEqual(["load"]);
  });
});
