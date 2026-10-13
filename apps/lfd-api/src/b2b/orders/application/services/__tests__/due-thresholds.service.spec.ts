import { DEFAULT_DELIVERY_AVAILABILITY, type DeliveryAvailabilityView } from "@lfd/contracts";

import { ServiceDay } from "../../../../../production/channels/commerce/index.js";
import { DeliveryAvailabilityReader } from "../../../../delivery-availability/domain/ports/delivery-availability.reader.js";
import {
  DeadlineOrdersReader,
  type SitedDeadlineOrder,
} from "../../../domain/ports/deadline-orders.reader.js";
import { DueThresholds } from "../due-thresholds.service.js";
import {
  FOURNIL_GPS,
  siteDeadlinesOf,
  siteSettings,
  VILLAGE_GPS,
} from "./site-deadlines-doubles.js";

class Orders extends DeadlineOrdersReader {
  readonly asked: string[] = [];
  constructor(private readonly orders: readonly SitedDeadlineOrder[]) {
    super();
  }
  forDay(day: string): Promise<readonly SitedDeadlineOrder[]> {
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

const ORDERS: readonly SitedDeadlineOrder[] = [
  {
    fulfillmentMethod: "delivery",
    window: { start: null, end: "06:00" },
    siteId: null,
    lines: [{ sku: "BAG", productName: "Baguette", quantity: 10 }],
  },
  {
    fulfillmentMethod: "pickup",
    window: { start: "08:00", end: "10:00" },
    siteId: null,
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
      siteDeadlinesOf({}).service,
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

    const due = await new DueThresholds(
      new Orders(ORDERS),
      new Settings(legacy),
      siteDeadlinesOf({}).service,
    ).dueThresholdsFor(ServiceDay.of("2030-01-15"));

    expect([due.deliveryMarginMinutes, due.pickupMarginMinutes]).toEqual([null, null]);
    expect(due.items[0]?.thresholds).toEqual([
      { kind: "day", before: null, quantity: 14, cumulative: 14 },
    ]);
  });
});

describe("DueThresholds — l'échéance selon le site (lot T0)", () => {
  const MARGINS = {
    ...DEFAULT_DELIVERY_AVAILABILITY,
    deliveryMarginMinutes: 50,
    pickupMarginMinutes: 20,
  };
  const pickup = (siteId: string | null): SitedDeadlineOrder => ({
    fulfillmentMethod: "pickup",
    window: { start: "08:00", end: "10:00" },
    siteId,
    lines: [{ sku: "BAG", productName: "Baguette", quantity: 4 }],
  });

  it("un retrait au village part avec le transfert : départ requis − marge de livraison", async () => {
    const { service } = siteDeadlinesOf({
      sites: new Map([
        ["site_fournil", siteSettings({ gps: FOURNIL_GPS })],
        [
          "site_village",
          siteSettings({
            supply: "transfer",
            gps: VILLAGE_GPS,
            counterSetupMinutes: 10,
            proPickup: { start: "07:30", end: "09:00" },
          }),
        ],
      ]),
      travelMinutes: 25,
    });

    const due = await new DueThresholds(
      new Orders([pickup("site_village")]),
      new Settings(MARGINS),
      service,
    ).dueThresholdsFor(ServiceDay.of("2030-01-15"));

    // 07:30 − 10 min de mise en place − 25 min de route = 06:55 ; − 50 = 06:05.
    expect(due.items[0]?.thresholds[0]?.before).toBe("06:05");
  });

  it("une commande sans site (passée avant S2) garde l'ancien calcul", async () => {
    const due = await new DueThresholds(
      new Orders([pickup(null)]),
      new Settings(MARGINS),
      siteDeadlinesOf({}).service,
    ).dueThresholdsFor(ServiceDay.of("2030-01-15"));

    expect(due.items[0]?.thresholds[0]?.before).toBe("07:40");
  });
});
