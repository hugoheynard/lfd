/**
 * E2E du **calculateur de tournée** — le parcours
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 7).
 *
 * Réglages du calcul, « Situer » sans géocodeur configuré, « Proposer » SANS
 * RÉSEAU à partir des points GPS du carnet, « Appliquer ». Le harnais ne
 * double qu'Auth0 : sans `BAN_GEOCODER_URL`, le géocodeur est éteint.
 */
import type { DeliveryRoutingSettingsView } from "@lfd/contracts";

import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  addVehicle,
  ADMIN_VERIFIER_OVERRIDE,
  admin,
  assign,
  dayView,
  forgetCustomer,
  openRound,
  roundOf,
  ROUNDS,
} from "./delivery-rounds-scene.js";
import {
  apply,
  forgetRoutingScene,
  ROAD_ROUTING_OVERRIDES,
  payloadOf,
  propose,
  seedDeparture,
  seedLocatedDelivery,
  timed,
} from "./delivery-routing-scene.js";

const DAY = serviceDay();
const SETTINGS = "/admin/livraison/calcul";

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

describe("les réglages du calcul (L7-C13, L7-C15)", () => {
  it("rend les défauts, puis ce qu'on a posé, et le trace", async () => {
    const before = jsonBody<DeliveryRoutingSettingsView>(
      await admin(ctx).get(SETTINGS).expect(200),
    );
    expect(before).toEqual({
      detourPercent: 140,
      averageSpeedKmh: 35,
      earliestDeparture: "06:00",
      maxRoundMinutes: 240,
      stopMinutes: 5,
      defaultMode: "new_rounds",
      multiplePassages: true,
      source: "default",
    });

    const posed = { ...before, averageSpeedKmh: 40, earliestDeparture: "05:30" };
    const { source: _source, ...payload } = posed;
    await admin(ctx).put(SETTINGS).send(payload).expect(204);

    const after = jsonBody<DeliveryRoutingSettingsView>(await admin(ctx).get(SETTINGS).expect(200));
    expect(after).toEqual({ ...payload, source: "explicit" });
    await ctx.drain();
    expect(
      await ctx.prisma.activityEvent.count({
        where: { type: "delivery_routing.settings_updated" },
      }),
    ).toBe(1);
  });

  it("refuse une forme fausse (400) et une valeur hors bornes (400), sans rien écrire", async () => {
    const valid = {
      detourPercent: 140,
      averageSpeedKmh: 35,
      earliestDeparture: "06:00",
      maxRoundMinutes: 240,
      stopMinutes: 5,
      defaultMode: "insert",
      multiplePassages: false,
    };

    await admin(ctx)
      .put(SETTINGS)
      .send({ ...valid, earliestDeparture: "6h" })
      .expect(400);
    const refused = await admin(ctx)
      .put(SETTINGS)
      .send({ ...valid, averageSpeedKmh: 400 })
      .expect(400);

    expect(jsonBody<{ message: string }>(refused).message).toContain("vitesse moyenne");
    expect(await ctx.prisma.deliveryRoutingSettings.count()).toBe(0);
  });
});

describe("situer les arrêts (L7-C9)", () => {
  it("sans géocodeur configuré, refuse en renvoyant au carnet — et n'écrit rien", async () => {
    await seedDeparture(ctx);
    await seedLocatedDelivery(ctx, DAY, null);

    const refused = await admin(ctx).post(`${ROUNDS}/situer?jour=${DAY}`).expect(409);

    expect(jsonBody<{ message: string }>(refused).message).toContain("points GPS");
    expect(await ctx.prisma.deliveryGeocode.count()).toBe(0);
  });
});

describe("proposer, puis appliquer (L7-C3 à C6)", () => {
  async function scene(): Promise<{
    readonly north: string[];
    readonly south: string[];
    readonly lost: string;
  }> {
    await seedDeparture(ctx);
    await addVehicle(ctx, "Kangoo");
    await addVehicle(ctx, "Trafic");
    // Aix-les-Bains au nord, Montmélian au sud-est.
    const north = [
      await seedLocatedDelivery(ctx, DAY, { lat: 45.69, lng: 5.91 }),
      await seedLocatedDelivery(ctx, DAY, { lat: 45.7, lng: 5.92 }),
    ];
    const south = [
      await seedLocatedDelivery(ctx, DAY, { lat: 45.5, lng: 6.05 }),
      await seedLocatedDelivery(ctx, DAY, { lat: 45.49, lng: 6.06 }),
    ];
    const lost = await seedLocatedDelivery(ctx, DAY, null);
    return { north, south, lost };
  }

  it("propose SANS réseau à partir des GPS du carnet, dit les non situés, et n'écrit rien", async () => {
    const { north, south, lost } = await scene();

    const view = await propose(ctx, `jour=${DAY}`);

    const groups = view.rounds.map((round) => round.stops.map((stop) => stop.orderId).sort());
    expect(groups.sort()).toEqual([[...north].sort(), [...south].sort()].sort());
    expect(view.unlocated).toEqual([
      expect.objectContaining({ orderId: lost, reason: "not_geocoded" }),
    ]);
    expect(view.rounds.every((round) => round.minutes > 0 && round.meters > 0)).toBe(true);
    expect(view.rounds.every((round) => round.departureTime === "06:00")).toBe(true);
    expect(await ctx.prisma.deliveryRound.count()).toBe(0);
  });

  it("deux « Proposer » sur le même état rendent la même proposition (L7-C12)", async () => {
    await scene();

    expect(await propose(ctx, `jour=${DAY}`)).toEqual(await propose(ctx, `jour=${DAY}`));
  });

  it("appliquer ouvre les tournées, dans l'ordre proposé, et trace UN fait", async () => {
    const { lost } = await scene();
    const view = await propose(ctx, `jour=${DAY}`);

    await apply(ctx, payloadOf(view)).expect(204);

    const day = await dayView(ctx, DAY);
    expect(day.rounds.map((round) => round.stops.map((stop) => stop.orderId)).sort()).toEqual(
      view.rounds.map((round) => round.stops.map((stop) => stop.orderId)).sort(),
    );
    expect(day.unassigned.map((order) => order.orderId)).toEqual([lost]);
    await ctx.drain();
    expect(
      await ctx.prisma.activityEvent.count({ where: { type: "delivery_round.proposal_applied" } }),
    ).toBe(1);
  });

  it("n'utilise que les véhicules cochés", async () => {
    await scene();
    const vehicles = await ctx.prisma.deliveryVehicle.findMany({ orderBy: { name: "asc" } });
    const kangoo = vehicles.find((vehicle) => vehicle.name === "Kangoo")?.id ?? "";

    const view = await propose(ctx, `jour=${DAY}&vehicules=${kangoo}`);

    expect(view.rounds.every((round) => round.vehicleId === kangoo)).toBe(true);
    expect(view.rounds.flatMap((round) => round.stops)).toHaveLength(4);
  });

  it("mode insert : insère dans la tournée composée à la main, sans en changer l'ordre", async () => {
    await seedDeparture(ctx);
    const vehicleId = await addVehicle(ctx, "Kangoo");
    const roundId = await openRound(ctx, DAY, vehicleId);
    // À la main : le plus loin d'abord, ce que l'optimiseur n'aurait pas fait.
    const far = await seedLocatedDelivery(ctx, DAY, { lat: 45.7, lng: 5.92 });
    const near = await seedLocatedDelivery(ctx, DAY, { lat: 45.6, lng: 5.9 });
    await assign(ctx, DAY, roundId, far);
    await assign(ctx, DAY, roundId, near);
    const fresh = await seedLocatedDelivery(ctx, DAY, { lat: 45.65, lng: 5.91 });

    const view = await propose(ctx, `jour=${DAY}&mode=insert`);
    expect(view.mode).toBe("insert");
    expect(view.rounds.map((round) => round.roundId)).toEqual([roundId]);
    await apply(ctx, payloadOf(view)).expect(204);

    const order = (await roundOf(ctx, DAY, roundId)).stops.map((stop) => stop.orderId);
    expect(order.filter((id) => id !== fresh)).toEqual([far, near]);
    expect(order).toContain(fresh);
  });

  it("refuse un mode inconnu (400)", async () => {
    await admin(ctx).get(`${ROUNDS}/proposition?jour=${DAY}&mode=tout`).expect(400);
  });

  it("refuse un jour mal formé (400)", async () => {
    await admin(ctx).get(`${ROUNDS}/proposition?jour=demain`).expect(400);
  });
});

describe("chronométrer une composition glissée à la main (L10b-C2)", () => {
  it("chronomètre dans l'ordre donné, trace chaque tournée, et n'écrit rien", async () => {
    await seedDeparture(ctx);
    const kangoo = await addVehicle(ctx, "Kangoo");
    const roundId = await openRound(ctx, DAY, kangoo);
    const placed = await seedLocatedDelivery(ctx, DAY, { lat: 45.69, lng: 5.91 });
    await assign(ctx, DAY, roundId, placed);
    const dragged = await seedLocatedDelivery(ctx, DAY, { lat: 45.5, lng: 6.05 });
    const before = await ctx.prisma.deliveryRound.findMany({ select: { id: true, version: true } });

    const view = await timed(ctx, {
      day: DAY,
      rounds: [{ roundId, vehicleId: kangoo, orderIds: [dragged, placed] }],
    });

    expect(view.day).toBe(DAY);
    expect(view.rounds[0]?.stops.map((stop) => stop.orderId)).toEqual([dragged, placed]);
    expect(view.rounds[0]?.departureTime).toBe("06:00");
    // Départ, deux arrêts, retour : le double trace la ligne brisée.
    expect(view.rounds[0]?.geometry).toHaveLength(4);
    expect(
      await ctx.prisma.deliveryRound.findMany({ select: { id: true, version: true } }),
    ).toEqual(before);
    expect(await ctx.prisma.deliveryRoundStop.count()).toBe(1);
  });
});
