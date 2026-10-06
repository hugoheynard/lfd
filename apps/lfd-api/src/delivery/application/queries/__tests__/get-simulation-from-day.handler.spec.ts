import type { DeliveryStopPoint } from "../../../channels/commerce/index.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { RoutingSettings } from "../../../domain/value-objects/routing-settings.js";
import { deliveryOn, LocatedDeliveryOrders } from "../../commands/__tests__/round-doubles.js";
import {
  FixedFleet,
  InMemoryGeocodeCache,
  InMemoryRoutingSettings,
  vehicleView,
} from "../../commands/__tests__/routing-doubles.js";
import { GetSimulationFromDayHandler } from "../get-simulation-from-day.handler.js";
import { GetSimulationFromDayQuery } from "../get-simulation-from-day.query.js";

const DAY = "2030-01-15";
const SITE = {
  label: "Hôtel du Col",
  ligne1: "1 route du Col",
  ligne2: "",
  codePostal: "73320",
  ville: "Tignes",
  pays: "France",
};

function point(orderId: string, overrides: Partial<DeliveryStopPoint> = {}): DeliveryStopPoint {
  return {
    orderId,
    reference: `CMD-${orderId}`,
    gps: { lat: 45.46, lng: 6.9 },
    address: null,
    window: null,
    stopMinutes: null,
    zoneId: null,
    ...overrides,
  };
}

function handlerOver(points: readonly DeliveryStopPoint[], cancelled: readonly string[] = []) {
  const orders = new LocatedDeliveryOrders(
    points.map((p) =>
      deliveryOn(p.orderId, DAY, cancelled.includes(p.orderId) ? { status: "cancelled" } : {}),
    ),
    points,
  );
  return new GetSimulationFromDayHandler(
    orders,
    new FixedFleet([
      vehicleView("v1", "Kangoo"),
      vehicleView("v2", "Trafic", "2020-01-01T10:00:00.000Z"),
    ]),
    new InMemoryRoutingSettings(),
    new InMemoryGeocodeCache(),
    new FixedClock(new Date(0)),
  );
}

describe("GetSimulationFromDayHandler — partir d'une vraie journée (L9-C8)", () => {
  it("copie les livraisons situées en arrêts inventés, sans identifiant de commande", async () => {
    const view = await handlerOver([
      point("o1", {
        address: SITE,
        window: { start: "07:00", end: "09:00" },
        stopMinutes: 12,
      }),
    ]).execute(new GetSimulationFromDayQuery(DAY));

    expect(view.day).toBe(DAY);
    expect(view.scenario.stops).toEqual([
      {
        id: "j1",
        label: "Hôtel du Col",
        gps: { lat: 45.46, lng: 6.9 },
        window: { start: "07:00", end: "09:00" },
        stopMinutes: 12,
      },
    ]);
    expect(JSON.stringify(view)).not.toContain("o1");
  });

  it("sans libellé d'adresse, prend le nom du client ; sans temps sur place, n'en invente pas", async () => {
    const view = await handlerOver([point("o1")]).execute(new GetSimulationFromDayQuery(DAY));

    expect(view.scenario.stops[0]?.label).toBe("Maison o1");
    expect(view.scenario.stops[0]).not.toHaveProperty("stopMinutes");
  });

  it("liste à part les livraisons sans point, et écarte les annulées", async () => {
    const view = await handlerOver(
      [point("o1"), point("o2", { gps: null }), point("o3")],
      ["o3"],
    ).execute(new GetSimulationFromDayQuery(DAY));

    expect(view.scenario.stops.map((s) => s.label)).toEqual(["Maison o1"]);
    expect(view.withoutPoint).toEqual([{ reference: "CMD-o2", label: "Maison o2" }]);
  });

  it("prend les véhicules actifs ce jour-là par leur nom, les réglages en vigueur, le départ réglé", async () => {
    const view = await handlerOver([point("o1")]).execute(new GetSimulationFromDayQuery(DAY));

    expect(view.scenario.vehicles).toEqual(["Kangoo"]);
    expect(view.scenario.settings).toEqual(RoutingSettings.DEFAULTS);
    expect(view.scenario.departure).toBeNull();
  });

  it("une journée vide rend un scénario vide, sans rien inventer", async () => {
    const view = await handlerOver([]).execute(new GetSimulationFromDayQuery(DAY));

    expect(view.scenario.stops).toEqual([]);
    expect(view.withoutPoint).toEqual([]);
  });
});
