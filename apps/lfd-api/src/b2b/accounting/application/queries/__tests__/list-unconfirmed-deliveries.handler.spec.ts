import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  UnconfirmedDeliveriesReader,
  type UnconfirmedDelivery,
} from "../../../domain/ports/unconfirmed-deliveries.reader.js";
import { ListUnconfirmedDeliveriesHandler } from "../list-unconfirmed-deliveries.handler.js";

class AskedReader extends UnconfirmedDeliveriesReader {
  readonly asked: string[] = [];
  rows: UnconfirmedDelivery[] = [];
  servedBefore(day: string): Promise<readonly UnconfirmedDelivery[]> {
    this.asked.push(day);
    return Promise.resolve(this.rows);
  }
}

describe("ListUnconfirmedDeliveries — les bons à constater (lot ZL)", () => {
  it("juge « passé » au jour de PARIS : à 00h30 le 1er novembre, le 31 octobre est passé", async () => {
    const reader = new AskedReader();
    reader.rows = [
      {
        orderId: "o1",
        orderNumber: "CMD-1",
        companyId: "c1",
        companyName: "Hôtel",
        serviceDay: "2026-10-31",
        fulfillmentMethod: "delivery",
        totalCents: 1200,
        placedAt: new Date("2026-10-30T08:00:00.000Z"),
        billedCompanyId: null,
      },
    ];
    const handler = new ListUnconfirmedDeliveriesHandler(
      reader,
      new FixedClock(new Date("2026-10-31T23:30:00.000Z")),
    );

    const view = await handler.execute();

    expect(reader.asked).toEqual(["2026-11-01"]);
    expect(view.before).toBe("2026-11-01");
    expect(view.orders.map((order) => order.orderNumber)).toEqual(["CMD-1"]);
    // La passation et le payeur figé servent au tri par période, pas à l'écran.
    expect(Object.keys(view.orders[0] ?? {})).not.toContain("placedAt");
  });
});
