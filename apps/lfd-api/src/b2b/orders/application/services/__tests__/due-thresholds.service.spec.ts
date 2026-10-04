import { DEFAULT_DELIVERY_AVAILABILITY, type DeliveryAvailabilityView } from "@lfd/contracts";

import { ServiceDay } from "../../../../../production/channels/commerce/index.js";
import { DeliveryAvailabilityReader } from "../../../../delivery-availability/domain/ports/delivery-availability.reader.js";
import { DeadlineOrdersReader } from "../../../domain/ports/deadline-orders.reader.js";
import type { DeadlineOrder } from "../../../domain/services/deadline-thresholds.js";
import { DueThresholds } from "../due-thresholds.service.js";

class Orders extends DeadlineOrdersReader {
  readonly asked: string[] = [];
  constructor(private readonly orders: readonly DeadlineOrder[]) {
    super();
  }
  forDay(day: string): Promise<readonly DeadlineOrder[]> {
    this.asked.push(day);
    return Promise.resolve(this.orders);
  }
}

class Settings extends DeliveryAvailabilityReader {
  constructor(private readonly view: DeliveryAvailabilityView) {
    super();
  }
  current(): Promise<DeliveryAvailabilityView> {
    return Promise.resolve(this.view);
  }
}

const ORDERS: readonly DeadlineOrder[] = [
  {
    fulfillmentMethod: "delivery",
    window: { start: null, end: "06:00" },
    lines: [{ sku: "BAG", productName: "Baguette", quantity: 10 }],
  },
  {
    fulfillmentMethod: "pickup",
    window: { start: "08:00", end: "10:00" },
    lines: [{ sku: "BAG", productName: "Baguette", quantity: 4 }],
  },
];

describe("DueThresholds — le commerce répond au fournil", () => {
  it("lit les commandes du jour demandé et les marges réglées", async () => {
    const orders = new Orders(ORDERS);
    const due = await new DueThresholds(
      orders,
      new Settings({
        ...DEFAULT_DELIVERY_AVAILABILITY,
        deliveryMarginMinutes: 50,
        pickupMarginMinutes: 20,
      }),
    ).dueThresholdsFor(ServiceDay.of("2030-01-15"));

    expect(orders.asked).toEqual(["2030-01-15"]);
    expect(due).toEqual({
      deliveryMarginMinutes: 50,
      pickupMarginMinutes: 20,
      items: [
        {
          sku: "BAG",
          productName: "Baguette",
          total: 14,
          thresholds: [
            { kind: "deadline", before: "05:10", quantity: 10, cumulative: 10 },
            { kind: "deadline", before: "07:40", quantity: 4, cumulative: 14 },
          ],
        },
      ],
    });
  });

  it("une vue qui ne porte pas les marges vaut « non réglées » : un seul seuil, la journée", async () => {
    const {
      deliveryMarginMinutes: _d,
      pickupMarginMinutes: _p,
      ...legacy
    } = DEFAULT_DELIVERY_AVAILABILITY;

    const due = await new DueThresholds(new Orders(ORDERS), new Settings(legacy)).dueThresholdsFor(
      ServiceDay.of("2030-01-15"),
    );

    expect([due.deliveryMarginMinutes, due.pickupMarginMinutes]).toEqual([null, null]);
    expect(due.items[0]?.thresholds).toEqual([
      { kind: "day", before: null, quantity: 14, cumulative: 14 },
    ]);
  });
});
