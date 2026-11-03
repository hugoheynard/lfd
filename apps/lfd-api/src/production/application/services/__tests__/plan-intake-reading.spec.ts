import { producibleOrder } from "../../../channels/commerce/__tests__/producible-order.fixture.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { FixedDayOrders, intakeReadingOf } from "../../__tests__/plan-intake-doubles.js";
import { SavedDays } from "../../__tests__/revision-desk-doubles.js";
import { DayResupplies } from "../../__tests__/settings-doubles.js";
import { InMemoryWithdrawals } from "../../__tests__/withdrawal-doubles.js";

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

    const intake = await reading.arrestUnderLock(DAY);

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
