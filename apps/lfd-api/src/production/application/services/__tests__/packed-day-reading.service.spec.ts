import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { closedDay, FixedDays } from "../../__tests__/quality-doubles.js";
import { FixedStationReader } from "../../__tests__/station-doubles.js";
import { PackedDayReading } from "../packed-day-reading.service.js";

/** Instants recopiés, jamais comparés à l'horloge. */
const AT = new Date("2026-09-13T05:10:00.000Z");
const DAY = ServiceDay.of("2026-09-13");

describe("PackedDayReading — la journée, bacs compris", () => {
  it("une journée `legacy` se lit telle que le fournil la tient", async () => {
    const legacy = closedDay(DAY, AT, ["ord_2"]);
    const reading = new PackedDayReading(
      new FixedDays(legacy),
      new FixedStationReader({
        orders: [{ orderId: "ord_1", packed: { at: AT, by: "x" }, containers: 1, lines: [] }],
        stocks: [],
      }),
    );

    const { day } = await reading.load(DAY);

    expect(day).toBe(legacy);
  });

  it("une journée `packing` prend ses bacs au colisage, et le fournil n'y voit plus les siens", async () => {
    const packing = ProductionDay.fromSnapshot({
      ...closedDay(DAY, AT, ["ord_2"]).toSnapshot(),
      packingOwner: "packing",
    });
    const reading = new PackedDayReading(
      new FixedDays(packing),
      new FixedStationReader({
        orders: [{ orderId: "ord_1", packed: { at: AT, by: "s1" }, containers: 2, lines: [] }],
        stocks: [{ sku: "VIE-001", received: 10, returned: 1, packed: 4 }],
      }),
    );

    const { day, available } = await reading.load(DAY);

    expect(day.orders.find((order) => order.orderId === "ord_1")).toMatchObject({
      packed: { at: AT, by: "s1" },
      containers: 2,
    });
    expect(day.orders.find((order) => order.orderId === "ord_2")?.packed).toBeNull();
    expect(available("VIE-001")).toBe(5);
  });
});
