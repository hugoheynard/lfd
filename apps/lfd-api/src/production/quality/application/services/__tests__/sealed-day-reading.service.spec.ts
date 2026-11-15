import { ServiceDay } from "../../../../day/index.js";
import {
  closedDay,
  FixedDays,
  packingDay,
} from "../../../../day/application/__tests__/closed-day-doubles.js";
import { FixedPackedOrders } from "../../../../channels/packing/__tests__/packed-orders-doubles.js";
import { SealedDayReading } from "../sealed-day-reading.service.js";

// Un jour et un instant comparés entre eux, jamais au mur.
const AT = new Date(1_000);
const DAY = ServiceDay.of("2030-03-12");

describe("SealedDayReading — la journée et ses bacs fermés (K3a)", () => {
  it("une journée `legacy` aussi demande au colisage — le fournil ne lit plus ses colonnes (K3c)", async () => {
    const legacy = closedDay(DAY, AT, ["ord_2"]);
    const packed = new FixedPackedOrders(new Map([["ord_1", { at: AT, by: "x" }]]));

    const day = await new SealedDayReading(new FixedDays(legacy), packed).load(DAY);

    expect(packed.asked).toEqual([DAY.value]);
    expect(day.orders.find((order) => order.orderId === "ord_1")?.packed).toEqual({
      at: AT,
      by: "x",
    });
    expect(day.orders.find((order) => order.orderId === "ord_2")?.packed).toBeNull();
  });

  it("une journée `packing` lit « colisée ? » au colisage, et seulement ça", async () => {
    const packing = packingDay(closedDay(DAY, AT, ["ord_2"]));
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
