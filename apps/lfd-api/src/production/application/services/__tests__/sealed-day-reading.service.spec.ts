import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { closedDay, FixedDays } from "../../__tests__/quality-doubles.js";
import { FixedPackedOrders } from "../../__tests__/station-doubles.js";
import { SealedDayReading } from "../sealed-day-reading.service.js";

// Un jour et un instant comparés entre eux, jamais au mur.
const AT = new Date(1_000);
const DAY = ServiceDay.of("2030-03-12");

describe("SealedDayReading — la journée et ses bacs fermés (K3a)", () => {
  it("une journée `legacy` se lit telle que le fournil la tient, sans demander au colisage", async () => {
    const legacy = closedDay(DAY, AT, ["ord_2"]);
    const packed = new FixedPackedOrders(new Map([["ord_1", { at: AT, by: "x" }]]));

    const day = await new SealedDayReading(new FixedDays(legacy), packed).load(DAY);

    expect(day).toBe(legacy);
    expect(packed.asked).toEqual([]);
  });

  it("une journée `packing` lit « colisée ? » au colisage, et seulement ça", async () => {
    const packing = ProductionDay.fromSnapshot({
      ...closedDay(DAY, AT, ["ord_2"]).toSnapshot(),
      packingOwner: "packing",
    });
    const packed = new FixedPackedOrders(new Map([["ord_1", { at: AT, by: "s1" }]]));

    const day = await new SealedDayReading(new FixedDays(packing), packed).load(DAY);

    expect(packed.asked).toEqual([DAY.value]);
    expect(day.orders.find((order) => order.orderId === "ord_1")?.packed).toEqual({
      at: AT,
      by: "s1",
    });
    // Le fournil n'y voit plus ses propres colonnes : `ord_2` y était fermé.
    expect(day.orders.find((order) => order.orderId === "ord_2")?.packed).toBeNull();
  });
});
