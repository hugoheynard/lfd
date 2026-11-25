import type { DeliveryDayAddressOrder } from "@lfd/contracts";

import { DeliveryDayOrdersReader } from "../../../channels/commerce/index.js";
import { GetDeliveryDayAddressesHandler } from "../get-delivery-day-addresses.handler.js";
import { GetDeliveryDayAddressesQuery } from "../get-delivery-day-addresses.query.js";

/** Le commerce, réduit à ce que la vue du jour lui demande. */
class RecordingDayOrders extends DeliveryDayOrdersReader {
  readonly asked: string[] = [];

  constructor(private readonly orders: readonly DeliveryDayAddressOrder[]) {
    super();
  }

  deliveriesOn(day: string): Promise<readonly DeliveryDayAddressOrder[]> {
    this.asked.push(day);
    return Promise.resolve(this.orders);
  }
}

const ORDER: DeliveryDayAddressOrder = {
  orderId: "o1",
  reference: "C-1",
  customerLabel: "Hôtel du Parc SAS",
  companyId: "c1",
  addressId: "a1",
  address: null,
  window: { start: null, end: "10:00" },
};

describe("GetDeliveryDayAddressesHandler", () => {
  it("demande au commerce les livraisons du jour lu, et rend le jour avec elles", async () => {
    const reader = new RecordingDayOrders([ORDER]);

    const view = await new GetDeliveryDayAddressesHandler(reader).execute(
      new GetDeliveryDayAddressesQuery("2026-11-26"),
    );

    expect(reader.asked).toEqual(["2026-11-26"]);
    expect(view).toEqual({ day: "2026-11-26", orders: [ORDER] });
  });
});
