import { DEFAULT_DELIVERY_AVAILABILITY, type DeliveryAvailabilityView } from "@lfd/contracts";

import {
  type PlacedResupply,
  ServiceDay,
} from "../../../../../production/channels/commerce/index.js";
import { DayResupplies } from "../../../../../production/channels/commerce/__tests__/day-resupplies-doubles.js";
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
      new DayResupplies(),
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

  it("une vue qui ne porte pas les marges vaut « non réglées », et elles comptent pour zéro", async () => {
    const {
      deliveryMarginMinutes: _d,
      pickupMarginMinutes: _p,
      ...legacy
    } = DEFAULT_DELIVERY_AVAILABILITY;

    const due = await new DueThresholds(
      new Orders(ORDERS),
      new Settings(legacy),
      siteDeadlinesOf({}).service,
      new DayResupplies(),
    ).dueThresholdsFor(ServiceDay.of("2030-01-15"));

    expect([due.deliveryMarginMinutes, due.pickupMarginMinutes]).toEqual([null, null]);
    expect(due.items[0]?.thresholds).toEqual([
      { kind: "deadline", before: "06:00", quantity: 10, cumulative: 10 },
      { kind: "deadline", before: "08:00", quantity: 4, cumulative: 14 },
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
      new DayResupplies(),
    ).dueThresholdsFor(ServiceDay.of("2030-01-15"));

    // 07:30 − 10 min de mise en place − 25 min de route = 06:55 ; − 50 = 06:05.
    expect(due.items[0]?.thresholds[0]?.before).toBe("06:05");
  });

  it("une commande sans site (passée avant S2) garde l'ancien calcul", async () => {
    const due = await new DueThresholds(
      new Orders([pickup(null)]),
      new Settings(MARGINS),
      siteDeadlinesOf({}).service,
      new DayResupplies(),
    ).dueThresholdsFor(ServiceDay.of("2030-01-15"));

    expect(due.items[0]?.thresholds[0]?.before).toBe("07:40");
  });
});

describe("DueThresholds — les réassorts « pour demain » dans le compte à rebours (H3c)", () => {
  const MARGINS = {
    ...DEFAULT_DELIVERY_AVAILABILITY,
    deliveryMarginMinutes: 50,
    pickupMarginMinutes: 20,
  };
  const SITES = new Map([
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
    ["site_labo", siteSettings({ counterSetupMinutes: 30 })],
  ]);
  const resupply = (
    siteId: string,
    arrivalBy: string | null,
    quantity: number,
  ): PlacedResupply => ({
    resupplyId: `r_${siteId}_${quantity}`,
    siteId,
    siteLabel: null,
    name: null,
    servedByTransfer: siteId === "site_village",
    arrivalBy,
    lines: [{ sku: "BAG", productName: "Baguette", quantity, saleUnit: "piece" }],
  });
  const villageOrder: SitedDeadlineOrder = {
    fulfillmentMethod: "pickup",
    window: { start: "09:00", end: "10:00" },
    siteId: "site_village",
    lines: [{ sku: "BAG", productName: "Baguette", quantity: 4 }],
  };

  async function thresholdsOf(
    orders: readonly SitedDeadlineOrder[],
    resupplies: readonly PlacedResupply[],
  ) {
    const arrivals = new Map(
      resupplies.flatMap((r) => (r.arrivalBy === null ? [] : [[r.siteId, r.arrivalBy] as const])),
    );
    const { service } = siteDeadlinesOf({ sites: SITES, travelMinutes: 25, resupplies: arrivals });
    const due = await new DueThresholds(
      new Orders(orders),
      new Settings(MARGINS),
      service,
      new DayResupplies(resupplies),
    ).dueThresholdsFor(ServiceDay.of("2030-01-15"));
    return due.items[0]?.thresholds;
  }

  it("un réassort par transfert à 05:30 entre dans les paliers et avance ceux des commandes du point", async () => {
    // 05:30 − 25 min de route = 05:05 ; − 50 min de marge de livraison = 04:15.
    expect(await thresholdsOf([villageOrder], [resupply("site_village", "05:30", 6)])).toEqual([
      { kind: "deadline", before: "04:15", quantity: 10, cumulative: 10 },
    ]);
  });

  it("un point à réassorts seuls est résolu : départ requis − marge de livraison", async () => {
    expect(await thresholdsOf([], [resupply("site_village", "06:00", 6)])).toEqual([
      { kind: "deadline", before: "04:45", quantity: 6, cumulative: 6 },
    ]);
  });

  it("au Labo, heure − marge de retrait, sans retirer la mise en place une seconde fois", async () => {
    // 06:30 − 20 min de retrait = 06:10 ; les 30 min de mise en place ne comptent pas.
    expect(await thresholdsOf([], [resupply("site_labo", "06:30", 3)])).toEqual([
      { kind: "deadline", before: "06:10", quantity: 3, cumulative: 3 },
    ]);
  });

  it("un réassort sans heure tombe au dernier seuil, comme aujourd'hui", async () => {
    expect(await thresholdsOf([villageOrder], [resupply("site_labo", null, 2)])).toEqual([
      { kind: "deadline", before: "06:05", quantity: 4, cumulative: 4 },
      { kind: "undated", before: null, quantity: 2, cumulative: 6 },
    ]);
  });
});
