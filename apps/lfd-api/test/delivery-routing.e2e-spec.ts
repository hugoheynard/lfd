/**
 * E2E du **calculateur de tournée** — le parcours
 * (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 7).
 *
 * Réglages du calcul, « Situer » sans géocodeur configuré, « Proposer » SANS
 * RÉSEAU à partir des points GPS du carnet, « Appliquer ». Le harnais ne
 * double qu'Auth0 : sans `BAN_GEOCODER_URL`, le géocodeur est éteint.
 */
import { type DeliveryRoutingSettingsView, instantToLocal } from "@lfd/contracts";

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
import { binTypeId } from "./delivery-loading-scene.js";
import {
  apply,
  forgetRoutingScene,
  ROAD_ROUTING_OVERRIDES,
  payloadOf,
  propose,
  seedDeparture,
  seedLocatedDelivery,
  seedPlannableDelivery,
  withBread,
  timed,
  MEASURED,
  seedBinCatalog,
} from "./delivery-routing-scene.js";

const DAY = serviceDay();
const SETTINGS = "/admin/livraison/calcul";
const BINS = "/admin/livraison/bacs";

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
  await seedBinCatalog(ctx);
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
      safetyMarginMinutes: 20,
      defaultContainer: null,
      binGapCm: 1,
      source: "default",
    });

    const posed = {
      ...before,
      averageSpeedKmh: 40,
      earliestDeparture: "05:30",
      safetyMarginMinutes: 30,
      binGapCm: 4,
    };
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
    const margin = await admin(ctx)
      .put(SETTINGS)
      .send({ ...valid, safetyMarginMinutes: 91 })
      .expect(400);
    expect(jsonBody<{ message: string }>(margin).message).toContain(
      "la marge de sécurité avant la fin d'un créneau tient entre 0 et 90 minutes",
    );
    const gap = await admin(ctx)
      .put(SETTINGS)
      .send({ ...valid, binGapCm: 11 })
      .expect(400);
    expect(jsonBody<{ message: string }>(gap).message).toContain(
      "le jeu entre bacs tient entre 0 et 10 cm",
    );
    expect(await ctx.prisma.deliveryRoutingSettings.count()).toBe(0);
  });

  it("le jeu entre bacs (G5a) : absent, la valeur posée est gardée", async () => {
    const valid = {
      earliestDeparture: "06:00",
      maxRoundMinutes: 240,
      stopMinutes: 5,
      defaultMode: "insert",
      multiplePassages: false,
    };
    await admin(ctx)
      .put(SETTINGS)
      .send({ ...valid, binGapCm: 0 })
      .expect(204);
    await admin(ctx)
      .put(SETTINGS)
      .send({ ...valid, stopMinutes: 6 })
      .expect(204);

    const view = jsonBody<DeliveryRoutingSettingsView>(await admin(ctx).get(SETTINGS).expect(200));
    expect(view).toMatchObject({ binGapCm: 0, stopMinutes: 6 });
  });
});

describe("situer les arrêts (L7-C9)", () => {
  it("sans géocodeur configuré, refuse en renvoyant au carnet — et n'écrit rien", async () => {
    await seedDeparture(ctx);
    await seedPlannableDelivery(ctx, DAY, null);

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
    await addVehicle(ctx, "Kangoo", MEASURED);
    await addVehicle(ctx, "Trafic", MEASURED);
    // Aix-les-Bains au nord, Montmélian au sud-est.
    const north = [
      await seedPlannableDelivery(ctx, DAY, { lat: 45.69, lng: 5.91 }),
      await seedPlannableDelivery(ctx, DAY, { lat: 45.7, lng: 5.92 }),
    ];
    const south = [
      await seedPlannableDelivery(ctx, DAY, { lat: 45.5, lng: 6.05 }),
      await seedPlannableDelivery(ctx, DAY, { lat: 45.49, lng: 6.06 }),
    ];
    const lost = await seedPlannableDelivery(ctx, DAY, null);
    return { north, south, lost };
  }

  it("propose SANS réseau à partir des GPS du carnet, dit les non situés, et n'écrit rien", async () => {
    const { north, south, lost } = await scene();

    const view = await propose(ctx, `jour=${DAY}`);

    // Réécrit le 2026-09-29 (lot 7 bis) : l'attente était « une vallée par
    // véhicule », ce que faisait la répartition par proximité. Les quatre
    // livraisons tiennent en UNE tournée : le calcul n'en ouvre pas une seconde.
    const placed = view.rounds.flatMap((round) => round.stops.map((stop) => stop.orderId));
    expect(view.rounds).toHaveLength(1);
    expect([...placed].sort()).toEqual([...north, ...south].sort());
    expect(view.unlocated).toEqual([
      expect.objectContaining({ orderId: lost, reason: "not_geocoded" }),
    ]);
    expect(view.rounds.every((round) => round.minutes > 0 && round.meters > 0)).toBe(true);
    expect(view.rounds.every((round) => round.departureTime === "06:00")).toBe(true);
    expect(await ctx.prisma.deliveryRound.count()).toBe(0);
  });

  /**
   * 2026-10-07 (Hugo : « proposer des tournées devrait être automatique à la
   * clôture ») : l'arrêt du plan compose et enregistre les tournées du jour,
   * comme « Proposer » puis « Appliquer » du bureau. Le non situé reste à
   * répartir ; un second arrêt (réannonce) ne recompose rien.
   */
  it("l'arrêt du plan compose les tournées tout seul, et le non situé reste à répartir", async () => {
    const { north, south, lost } = await scene();

    await admin(ctx).post(`/admin/production/batch/${DAY}/close`).expect(201);
    await ctx.drain();

    const stops = await ctx.prisma.deliveryRoundStop.findMany({
      where: { removedAt: null, round: { serviceDay: DAY } },
      select: { orderId: true },
    });
    expect(stops.map((stop) => stop.orderId).sort()).toEqual([...north, ...south].sort());
    expect(stops.map((stop) => stop.orderId)).not.toContain(lost);
    const rounds = await ctx.prisma.deliveryRound.count({ where: { serviceDay: DAY } });

    await admin(ctx).post(`/admin/production/batch/${DAY}/close`).expect(201);
    await ctx.drain();
    expect(await ctx.prisma.deliveryRound.count({ where: { serviceDay: DAY } })).toBe(rounds);
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

  it("appliquer garde l'horaire prévu par le serveur ; réordonner à la main l'efface (I10)", async () => {
    await scene();
    const view = await propose(ctx, `jour=${DAY}`);
    const proposed = view.rounds[0];

    await apply(ctx, payloadOf(view)).expect(204);

    const [round] = (await dayView(ctx, DAY)).rounds;
    const planned = round?.planned ?? null;
    expect(planned).not.toBeNull();
    // Le serveur rechronomètre la même composition : il retombe sur l'aperçu.
    expect(planned?.meters).toBe(proposed?.meters);
    expect(instantToLocal(new Date(planned?.departureAt ?? "")).time).toBe(proposed?.departureTime);
    expect(instantToLocal(new Date(planned?.returnAt ?? "")).time).toBe(proposed?.returnTime);

    const stopIds = (round?.stops ?? []).map((stop) => stop.stopId);
    await admin(ctx)
      .put(`${ROUNDS}/${round?.id ?? ""}/ordre`)
      .send({ stopIds: [...stopIds].reverse(), version: round?.version })
      .expect(204);

    expect((await roundOf(ctx, DAY, round?.id ?? "")).planned).toBeNull();
    const row = await ctx.prisma.deliveryRound.findUniqueOrThrow({
      where: { id: round?.id ?? "" },
    });
    expect([row.plannedDepartureAt, row.plannedReturnAt, row.plannedMeters]).toEqual([
      null,
      null,
      null,
    ]);
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
    const vehicleId = await addVehicle(ctx, "Kangoo", MEASURED);
    const roundId = await openRound(ctx, DAY, vehicleId);
    // À la main : le plus loin d'abord, ce que l'optimiseur n'aurait pas fait.
    const far = await seedPlannableDelivery(ctx, DAY, { lat: 45.7, lng: 5.92 });
    const near = await seedPlannableDelivery(ctx, DAY, { lat: 45.6, lng: 5.9 });
    await assign(ctx, DAY, roundId, far);
    await assign(ctx, DAY, roundId, near);
    const fresh = await seedPlannableDelivery(ctx, DAY, { lat: 45.65, lng: 5.91 });

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

describe("la place des véhicules dans « Proposer » (CA4)", () => {
  /** Une seule pile de Bacs M au sol (70 × 50 cm), cinq bacs de haut. */
  const ONE_STACK = { lengthCm: 70, widthCm: 50, heightCm: 120 } as const;

  async function delivery(pains: number | null): Promise<string> {
    const orderId = await seedLocatedDelivery(ctx, DAY, { lat: 45.69, lng: 5.91 });
    if (pains !== null) {
      await withBread(ctx, orderId, pains);
    }
    return orderId;
  }

  /**
   * Régression : avant le 2026-10-06, la commande sans ligne restait à
   * répartir (`unknown_demand`) ; elle est désormais placée, sa tournée dite
   * « place non vérifiée ».
   */
  it("un petit véhicule qui déborderait : un second passage, la trop grosse reste à répartir, celle sans bacs connus est placée", async () => {
    await seedDeparture(ctx);
    const bike = await addVehicle(ctx, "Vélo-cargo", ONE_STACK);
    // Trois bacs chacune (trente pains, dix par bac) : ensemble, six bacs pour une pile de cinq.
    const first = await delivery(30);
    const second = await delivery(30);
    const huge = await delivery(60);
    const unknown = await delivery(null);

    const view = await propose(ctx, `jour=${DAY}`);

    expect(view.rounds.every((round) => round.vehicleId === bike)).toBe(true);
    expect(view.rounds.map((round) => round.stops.map((stop) => stop.orderId))).toHaveLength(2);
    expect(view.rounds.flatMap((round) => round.stops.map((stop) => stop.orderId)).sort()).toEqual(
      [first, second, unknown].sort(),
    );
    expect(view.unfit.map(({ orderId, reason }) => [orderId, reason])).toEqual([
      [huge, "capacity"],
    ]);
    expect(view.unfit.every((order) => order.reference.startsWith("TRN-"))).toBe(true);
    expect(view.unknownDemand.map((order) => order.orderId)).toEqual([unknown]);
    expect(view.overflow).toEqual([]);
  });
});

describe("le contenant par défaut d'une commande (2026-10-06)", () => {
  const ONE_STACK = { lengthCm: 70, widthCm: 50, heightCm: 120 } as const;

  async function settingsWith(
    defaultContainer: { readonly binTypeId: string; readonly count: number } | null,
  ): Promise<void> {
    const current = jsonBody<DeliveryRoutingSettingsView>(
      await admin(ctx).get(SETTINGS).expect(200),
    );
    const { source: _source, ...payload } = current;
    await admin(ctx)
      .put(SETTINGS)
      .send({ ...payload, defaultContainer })
      .expect(204);
  }

  /** Une commande de trois Bacs M estimés, et une sans ligne, sur un vélo à une pile. */
  async function scene(): Promise<{ readonly known: string; readonly bare: string }> {
    await seedDeparture(ctx);
    await addVehicle(ctx, "Vélo-cargo", ONE_STACK);
    const known = await seedLocatedDelivery(ctx, DAY, { lat: 45.69, lng: 5.91 });
    await withBread(ctx, known, 30);
    const bare = await seedLocatedDelivery(ctx, DAY, { lat: 45.7, lng: 5.92 });
    return { known, bare };
  }

  it("réglé : la commande sans ligne compte pour 1 manne, et le petit véhicule déborde", async () => {
    const manne = await binTypeId(ctx, "Manne");
    await settingsWith({ binTypeId: manne, count: 1 });
    const { known, bare } = await scene();

    const view = await propose(ctx, `jour=${DAY}`);

    // Une pile de Bacs M, une pile de mannes : deux piles pour un plancher qui n'en tient qu'une.
    expect(view.rounds.map((round) => round.stops.map((stop) => stop.orderId)).sort()).toEqual(
      [[known], [bare]].sort(),
    );
    expect(view.unknownDemand).toEqual([]);
    expect(view.defaultDemand).toEqual([
      expect.objectContaining({
        orderId: bare,
        binTypeName: "Manne",
        count: 1,
        withEstimate: false,
      }),
    ]);
  });

  it("vide : la commande sans ligne est placée sans contrôle, « place non vérifiée »", async () => {
    const { known, bare } = await scene();

    const view = await propose(ctx, `jour=${DAY}`);

    expect(view.rounds.map((round) => round.stops.map((stop) => stop.orderId).sort())).toEqual([
      [known, bare].sort(),
    ]);
    expect(view.unknownDemand.map((order) => order.orderId)).toEqual([bare]);
    expect(view.defaultDemand).toEqual([]);
  });

  it("archiver le type choisi est refusé (409) ; vidé, le réglage le laisse archiver", async () => {
    const manne = await binTypeId(ctx, "Manne");
    await settingsWith({ binTypeId: manne, count: 2 });

    const refused = await admin(ctx).post(`${BINS}/${manne}/archiver`).expect(409);
    const body = jsonBody<{ code: string; message: string }>(refused);
    expect(body.code).toBe("delivery.default_container_bin_type_archive");
    expect(body.message).toContain("« Manne » est le contenant par défaut");

    await settingsWith(null);
    await admin(ctx).post(`${BINS}/${manne}/archiver`).expect(204);
  });

  it("refuse un type archivé comme contenant par défaut (409), sans rien écrire", async () => {
    const manne = await binTypeId(ctx, "Manne");
    await admin(ctx).post(`${BINS}/${manne}/archiver`).expect(204);

    const current = jsonBody<DeliveryRoutingSettingsView>(
      await admin(ctx).get(SETTINGS).expect(200),
    );
    const { source: _source, ...payload } = current;
    await admin(ctx)
      .put(SETTINGS)
      .send({ ...payload, defaultContainer: { binTypeId: manne, count: 1 } })
      .expect(409);
    expect(
      jsonBody<DeliveryRoutingSettingsView>(await admin(ctx).get(SETTINGS).expect(200))
        .defaultContainer,
    ).toBeNull();
  });
});

describe("chronométrer une composition glissée à la main (L10b-C2)", () => {
  it("chronomètre dans l'ordre donné, trace chaque tournée, et n'écrit rien", async () => {
    await seedDeparture(ctx);
    const kangoo = await addVehicle(ctx, "Kangoo", MEASURED);
    const roundId = await openRound(ctx, DAY, kangoo);
    const placed = await seedPlannableDelivery(ctx, DAY, { lat: 45.69, lng: 5.91 });
    await assign(ctx, DAY, roundId, placed);
    const dragged = await seedPlannableDelivery(ctx, DAY, { lat: 45.5, lng: 6.05 });
    const before = await ctx.prisma.deliveryRound.findMany({ select: { id: true, version: true } });

    const view = await timed(ctx, {
      day: DAY,
      rounds: [{ roundId, vehicleId: kangoo, orderIds: [dragged, placed] }],
    });

    expect(view.day).toBe(DAY);
    expect(view.rounds[0]?.stops.map((stop) => stop.orderId)).toEqual([dragged, placed]);
    expect(view.rounds[0]?.departureTime).toBe("06:00");
    // Sans échéance, aucune place n'est intenable : pas d'alerte rouge (CA5).
    expect(view.rounds[0]?.stops.map((stop) => stop.placementLate)).toEqual([false, false]);
    // Départ, deux arrêts, retour : le double trace la ligne brisée.
    expect(view.rounds[0]?.geometry).toHaveLength(4);
    expect(
      await ctx.prisma.deliveryRound.findMany({ select: { id: true, version: true } }),
    ).toEqual(before);
    expect(await ctx.prisma.deliveryRoundStop.count()).toBe(1);
  });

  it("compte chez un arrêt le temps de livraison de SON adresse, lu par le canal (L7b-C4)", async () => {
    await seedDeparture(ctx);
    const kangoo = await addVehicle(ctx, "Kangoo", MEASURED);
    const usual = await seedPlannableDelivery(ctx, DAY, { lat: 45.69, lng: 5.91 });
    const slow = await seedPlannableDelivery(ctx, DAY, { lat: 45.69, lng: 5.91 }, 45);

    const view = await timed(ctx, {
      day: DAY,
      rounds: [
        { roundId: null, vehicleId: kangoo, orderIds: [usual] },
        { roundId: null, vehicleId: kangoo, orderIds: [slow] },
      ],
    });

    // Même lieu : seul le temps sur place diffère — 45 minutes contre les 5 du réglage.
    const [first, second] = view.rounds;
    expect((second?.minutes ?? 0) - (first?.minutes ?? 0)).toBe(40);
  });
});
