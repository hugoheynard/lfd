import {
  type ProducibleOrder,
  ServiceDay,
} from "../../../../../production/channels/commerce/index.js";
import { DayOrdersSource, type SourcedDayOrder } from "../../../domain/ports/day-orders.source.js";
import type { ClockWindow } from "../../../domain/services/transfer-departure.js";
import { SitedDayOrders } from "../sited-day-orders.service.js";
import {
  FOURNIL_GPS,
  siteDeadlinesOf,
  siteSettings,
  VILLAGE_GPS,
} from "./site-deadlines-doubles.js";

class FixedSource extends DayOrdersSource {
  constructor(private readonly orders: readonly SourcedDayOrder[]) {
    super();
  }

  producibleFor(): Promise<readonly SourcedDayOrder[]> {
    return Promise.resolve(this.orders);
  }
}

const WINDOW: ClockWindow = { start: "08:00", end: "10:00" };

function sourced(
  orderId: string,
  fulfillmentMethod: ProducibleOrder["fulfillmentMethod"],
  siteId: string | null,
  window: ClockWindow | null = WINDOW,
): SourcedDayOrder {
  return {
    order: {
      orderId,
      reference: orderId.toUpperCase(),
      customerLabel: "Les Halles",
      fulfillmentMethod,
      destination: "Le Labo",
      clientele: "pro",
      siteId,
      lines: [{ sku: "BAG", productName: "Baguette", quantity: 2 }],
      sheetDetails: null,
    },
    window,
  };
}

async function dueAtOf(orders: readonly SourcedDayOrder[]): Promise<Record<string, unknown>> {
  const { service } = siteDeadlinesOf({
    sites: new Map([
      ["site_fournil", siteSettings({ gps: FOURNIL_GPS, counterSetupMinutes: 0 })],
      ["site_comptoir", siteSettings({ counterSetupMinutes: 15 })],
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
  const read = await new SitedDayOrders(new FixedSource(orders), service).producibleFor(
    ServiceDay.of("2030-01-15"),
  );
  return Object.fromEntries(read.map((order) => [order.orderId, order.dueAt]));
}

describe("SitedDayOrders — l'heure « à destination » remise au fournil (T0)", () => {
  it("livraison : la fenêtre du client, inchangée", async () => {
    expect(await dueAtOf([sourced("liv", "delivery", null)])).toEqual({ liv: "08:00" });
  });

  it("retrait d'une commande d'avant S2 (sans site) : l'ancien calcul", async () => {
    expect(await dueAtOf([sourced("old", "pickup", null)])).toEqual({ old: "08:00" });
  });

  it("retrait sur place à mise en place nulle : inchangé", async () => {
    expect(await dueAtOf([sourced("labo", "pickup", "site_fournil")])).toEqual({ labo: "08:00" });
  });

  it("retrait sur place : la fenêtre moins la mise en place", async () => {
    expect(await dueAtOf([sourced("cpt", "pickup", "site_comptoir")])).toEqual({ cpt: "07:45" });
  });

  it("retrait par transfert : l'arrivée requise au site, pas la fenêtre du client", async () => {
    expect(await dueAtOf([sourced("vil", "pickup", "site_village")])).toEqual({ vil: "07:20" });
  });

  it("garde tout le reste du snapshot, site compris", async () => {
    const { service } = siteDeadlinesOf({});
    const [order] = await new SitedDayOrders(
      new FixedSource([sourced("old", "pickup", null)]),
      service,
    ).producibleFor(ServiceDay.of("2030-01-15"));

    expect(order).toMatchObject({ orderId: "old", siteId: null, clientele: "pro" });
  });
});
