/**
 * E2E **sans calcul routier** (`documentation/livraisons/plan-preparation-de-tournee.md`,
 * lot 10 bis, L10b-C5) : le vol d'oiseau a disparu. Sans OSRM, « Proposer »,
 * « Chronométrer » et le simulateur refusent en 409 avec la phrase à lire, et
 * n'écrivent rien.
 *
 * La matrice posée est celle que le module injecte sans `OSRM_URL` — posée
 * explicitement, parce que le poste de dev peut porter une `OSRM_URL` locale
 * dans son `.env` (constaté le 2026-09-29) : sans ça, la suite dépendrait du
 * conteneur OSRM allumé ou non.
 */
import type { DeliverySimulationPayload } from "@lfd/contracts";

import { DistanceMatrix } from "../src/delivery/domain/ports/distance-matrix.js";
import { RouteGeometry } from "../src/delivery/domain/ports/route-geometry.js";
import {
  DisabledDistanceMatrix,
  DisabledRouteGeometry,
} from "../src/delivery/infrastructure/disabled-road-routing.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  addVehicle,
  ADMIN_VERIFIER_OVERRIDE,
  admin,
  forgetCustomer,
} from "./delivery-rounds-scene.js";
import {
  forgetRoutingScene,
  PROPOSAL,
  seedDeparture,
  seedLocatedDelivery,
  time,
} from "./delivery-routing-scene.js";

const DAY = serviceDay();
const REFUSAL =
  "Le calcul routier ne répond pas : réessayez dans une minute. Les tournées existantes ne sont pas touchées.";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: DistanceMatrix, value: new DisabledDistanceMatrix() },
      { token: RouteGeometry, value: new DisabledRouteGeometry() },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
  forgetRoutingScene();
});

const messageOf = (response: Parameters<typeof jsonBody>[0]): string =>
  jsonBody<{ message: string }>(response).message;

describe("sans OSRM, le calcul refuse — plus de vol d'oiseau (L10b-C5)", () => {
  it("« Proposer » : 409, la phrase à lire, rien d'écrit", async () => {
    await seedDeparture(ctx);
    await addVehicle(ctx, "Kangoo");
    await seedLocatedDelivery(ctx, DAY, { lat: 45.69, lng: 5.91 });

    const refused = await admin(ctx).get(`${PROPOSAL}?jour=${DAY}`).expect(409);

    expect(messageOf(refused)).toBe(REFUSAL);
    expect(await ctx.prisma.deliveryRound.count()).toBe(0);
  });

  it("« Chronométrer » : 409, la même phrase", async () => {
    await seedDeparture(ctx);
    const kangoo = await addVehicle(ctx, "Kangoo");
    const order = await seedLocatedDelivery(ctx, DAY, { lat: 45.69, lng: 5.91 });

    const refused = await time(ctx, {
      day: DAY,
      rounds: [{ roundId: null, vehicleId: kangoo, orderIds: [order] }],
    }).expect(409);

    expect(messageOf(refused)).toBe(REFUSAL);
  });

  it("le simulateur : 409, la même phrase", async () => {
    await seedDeparture(ctx);
    const scenario: DeliverySimulationPayload = {
      stops: [{ id: "a", label: "Arrêt", gps: { lat: 45.56, lng: 5.92 }, window: null }],
      vehicles: ["Kangoo"],
      settings: {
        earliestDeparture: "06:00",
        maxRoundMinutes: 240,
        stopMinutes: 5,
        defaultMode: "new_rounds",
        multiplePassages: true,
      },
      departure: null,
    };

    const refused = await admin(ctx).post("/admin/livraison/simulateur").send(scenario).expect(409);

    expect(messageOf(refused)).toBe(REFUSAL);
  });
});
