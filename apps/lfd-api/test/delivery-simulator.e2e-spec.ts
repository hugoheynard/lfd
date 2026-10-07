/**
 * E2E du **simulateur de tournée** (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`,
 * lot 9, L9-C1 à L9-C5) : une LECTURE sous `delivery_rounds:read`, sur des
 * arrêts inventés. Rien n'est écrit, rien n'est géocodé.
 */
import type { DeliverySimulationPayload, DeliverySimulationView, StaffRole } from "@lfd/contracts";

import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { ADMIN_VERIFIER_OVERRIDE, admin, forgetCustomer } from "./delivery-rounds-scene.js";
import {
  forgetRoutingScene,
  ROAD_ROUTING_OVERRIDES,
  seedDeparture,
} from "./delivery-routing-scene.js";

const SIMULATOR = "/admin/livraison/simulateur";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE, ...ROAD_ROUTING_OVERRIDES] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
  forgetRoutingScene();
});

const SETTINGS: DeliverySimulationPayload["settings"] = {
  detourPercent: 140,
  averageSpeedKmh: 35,
  earliestDeparture: "06:00",
  maxRoundMinutes: 240,
  stopMinutes: 5,
  defaultMode: "insert",
  multiplePassages: true,
};

function scenario(stopCount: number): DeliverySimulationPayload {
  return {
    stops: Array.from({ length: stopCount }, (_, index) => ({
      id: `a${index}`,
      label: `Arrêt ${index}`,
      gps: { lat: 45.56 + index * 0.001, lng: 5.92 + index * 0.001 },
      window: index === 0 ? { start: null, end: "09:00" } : null,
    })),
    vehicles: ["Kangoo", "Trafic"],
    settings: SETTINGS,
    departure: null,
  };
}

/** Ce que les tables du bloc `delivery` contiennent : la preuve que rien ne s'écrit. */
async function deliveryCounts(): Promise<readonly number[]> {
  return Promise.all([
    ctx.prisma.deliveryVehicle.count(),
    ctx.prisma.deliveryDeparture.count(),
    ctx.prisma.deliveryRound.count(),
    ctx.prisma.deliveryRoundStop.count(),
    ctx.prisma.deliveryRoutingSettings.count(),
    ctx.prisma.deliveryGeocode.count(),
  ]);
}

describe("POST admin/livraison/simulateur (L9-C1)", () => {
  it("rend une proposition depuis le point de départ réglé, et n'écrit rien", async () => {
    await seedDeparture(ctx);
    const before = await deliveryCounts();

    const response = await admin(ctx).post(SIMULATOR).send(scenario(3)).expect(200);

    const view = jsonBody<DeliverySimulationView>(response);
    expect(view.estimate).toBe("road"); // déprécié, toujours `road` (L10b-C5)
    expect(view.departure).toEqual({ label: "Laboratoire", lat: 45.5646, lng: 5.9178 });
    const placed = view.rounds.flatMap((round) => round.stops.map((stop) => stop.stopId));
    expect([...placed, ...view.overflow.map((o) => o.stopId)].sort()).toEqual(["a0", "a1", "a2"]);
    expect(await deliveryCounts()).toEqual(before);
  });

  it("sans point de départ réglé ni saisi : 409 qui renvoie au réglage", async () => {
    await admin(ctx).post(SIMULATOR).send(scenario(1)).expect(409);
  });

  it("refuse 61 arrêts (400), avant tout calcul", async () => {
    await seedDeparture(ctx);

    await admin(ctx).post(SIMULATOR).send(scenario(61)).expect(400);
  });

  it("refuse un réglage hors bornes du domaine (400)", async () => {
    await seedDeparture(ctx);

    await admin(ctx)
      .post(SIMULATOR)
      .send({ ...scenario(1), settings: { ...SETTINGS, averageSpeedKmh: 500 } })
      .expect(400);
  });

  it("refuse le support (403) : le droit est celui de la composition", async () => {
    await seedDeparture(ctx);
    const support = await asRole("support");

    await support.post(SIMULATOR).send(scenario(1)).expect(403);
  });
});

/** Sème une personne de ce rôle, déjà entrée, et rend son agent HTTP. */
async function asRole(role: StaffRole): Promise<ReturnType<E2eContext["asSub"]>> {
  const sub = `staff-${role}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: role,
      email: `${role}@lfc.test`,
      role,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}
