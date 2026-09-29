/**
 * E2E de la **composition des tournées** — le parcours
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 3).
 *
 * Ce que seul l'e2e prouve : l'unicité `(jour, véhicule, passage)`, l'index
 * unique PARTIEL sur la commande (écrit à la main, Prisma ne le connaît pas),
 * la même ligne qui change de tournée, les versions exigées en base, la
 * colonne `closed_at` relue et réécrite telle quelle, et l'acteur des faits.
 */
import { bootstrapE2e, E2E_STAFF_ID, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  addVehicle,
  ADMIN_VERIFIER_OVERRIDE,
  admin,
  assign,
  dayView,
  forgetCustomer,
  openRound,
  ROUNDS,
  roundOf,
  seedDelivery,
} from "./delivery-rounds-scene.js";

const DAY = serviceDay();
const OTHER_DAY = serviceDay(8);

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  forgetCustomer();
});

describe("ouvrir", () => {
  it("ouvre le passage 1 puis le passage 2 du même véhicule (Q13), nom recopié", async () => {
    const kangoo = await addVehicle(ctx, "Kangoo blanc");
    const first = await openRound(ctx, DAY, kangoo);
    const second = await openRound(ctx, DAY, kangoo);
    await admin(ctx)
      .put(`/admin/livraison/vehicules/${kangoo}`)
      .send({ name: "Kangoo gris", plate: "AB-101-CD" })
      .expect(204);

    const { rounds } = await dayView(ctx, DAY);
    expect(
      rounds.map(({ id, passage, vehicleName, version, vehicleRetired }) => ({
        id,
        passage,
        vehicleName,
        version,
        vehicleRetired,
      })),
    ).toEqual([
      { id: first, passage: 1, vehicleName: "Kangoo blanc", version: 1, vehicleRetired: false },
      { id: second, passage: 2, vehicleName: "Kangoo blanc", version: 1, vehicleRetired: false },
    ]);
  });

  it("refuse un jour qui n'existe pas (400) et un véhicule inconnu (404)", async () => {
    await admin(ctx).post(ROUNDS).send({ day: "2030-02-30", vehicleId: "x" }).expect(404);
    const kangoo = await addVehicle(ctx, "Kangoo");
    await admin(ctx).post(ROUNDS).send({ day: "2030-02-30", vehicleId: kangoo }).expect(400);
  });
});

describe("affecter", () => {
  it("affecte en dernier, sort la commande de « à répartir », et la cite au journal", async () => {
    const round = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    const first = await seedDelivery(ctx, DAY);
    const second = await seedDelivery(ctx, DAY);
    await assign(ctx, DAY, round, first.id);

    const view = await dayView(ctx, DAY);
    expect(view.unassigned).toEqual([{ orderId: second.id, reference: second.reference }]);
    expect(view.rounds[0]?.stops).toEqual([
      expect.objectContaining({
        orderId: first.id,
        reference: first.reference,
        position: 1,
        signals: [],
        orderDay: DAY,
      }),
    ]);
    expect(view.rounds[0]?.version).toBe(2);
  });

  it("🔴 l'index refuse une commande dans deux tournées vivantes, même d'un AUTRE jour (I3)", async () => {
    const kangoo = await addVehicle(ctx, "Kangoo");
    const today = await openRound(ctx, DAY, kangoo);
    const later = await openRound(ctx, OTHER_DAY, kangoo);
    const order = await seedDelivery(ctx, DAY);
    await assign(ctx, DAY, today, order.id);
    // Sa date a changé : elle est désormais du jour de l'autre tournée.
    await ctx.prisma.order.update({
      where: { id: order.id },
      data: { requestedDeliveryDate: new Date(`${OTHER_DAY}T00:00:00.000Z`) },
    });

    const { version } = await roundOf(ctx, OTHER_DAY, later);
    const refused = await admin(ctx)
      .post(`${ROUNDS}/${later}/arrets`)
      .send({ orderId: order.id, version })
      .expect(409);
    expect(JSON.stringify(refused.body)).toContain(DAY);

    // L'index lui-même, sans le handler : la base refuse une seconde ligne vivante.
    await expect(
      ctx.prisma.deliveryRoundStop.create({
        data: {
          id: "forged",
          roundId: later,
          orderId: order.id,
          serviceDay: OTHER_DAY,
          position: 1,
          createdAt: new Date(0),
        },
      }),
    ).rejects.toThrow();
  });
});

describe("déplacer — I7", () => {
  it("déplace la MÊME ligne, avance les deux versions, et écrit UN fait", async () => {
    const from = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    const to = await openRound(ctx, DAY, await addVehicle(ctx, "Trafic"));
    const order = await seedDelivery(ctx, DAY);
    const stopId = await assign(ctx, DAY, from, order.id);

    await admin(ctx)
      .post(`${ROUNDS}/${from}/arrets/${stopId}/deplacement`)
      .send({ toRoundId: to, fromVersion: 2, toVersion: 1 })
      .expect(204);

    const row = await ctx.prisma.deliveryRoundStop.findUniqueOrThrow({ where: { id: stopId } });
    expect(row).toMatchObject({ roundId: to, position: 1, removedAt: null });
    expect(await ctx.prisma.deliveryRoundStop.count()).toBe(1);
    expect([
      (await roundOf(ctx, DAY, from)).version,
      (await roundOf(ctx, DAY, to)).version,
    ]).toEqual([3, 2]);
    const moved = await ctx.prisma.activityEvent.findMany({
      where: { type: "delivery_round.stop_moved" },
      select: { subjectId: true, actorType: true, actorId: true },
    });
    expect(moved).toEqual([{ subjectId: to, actorType: "staff", actorId: E2E_STAFF_ID }]);
  });

  it("répond 409 « rechargez » à une version périmée, sans rien écrire", async () => {
    const from = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    const to = await openRound(ctx, DAY, await addVehicle(ctx, "Trafic"));
    const stopId = await assign(ctx, DAY, from, (await seedDelivery(ctx, DAY)).id);

    const refused = await admin(ctx)
      .post(`${ROUNDS}/${from}/arrets/${stopId}/deplacement`)
      .send({ toRoundId: to, fromVersion: 1, toVersion: 1 })
      .expect(409);

    expect(JSON.stringify(refused.body)).toContain("rechargez");
    expect((await roundOf(ctx, DAY, from)).stops).toHaveLength(1);
  });
});

describe("réordonner — I2", () => {
  async function threeStops(): Promise<{
    round: string;
    stops: readonly [string, string, string];
  }> {
    const round = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    const one = async (): Promise<string> =>
      assign(ctx, DAY, round, (await seedDelivery(ctx, DAY)).id);
    const a = await one();
    const b = await one();
    const c = await one();
    return { round, stops: [a, b, c] };
  }

  it("range selon la permutation, et trace avant/après", async () => {
    const { round, stops } = await threeStops();
    const [a, b, c] = stops;

    await admin(ctx)
      .put(`${ROUNDS}/${round}/ordre`)
      .send({ stopIds: [c, a, b], version: 4 })
      .expect(204);

    expect((await roundOf(ctx, DAY, round)).stops.map((stop) => stop.stopId)).toEqual([c, a, b]);
    expect(
      await ctx.prisma.activityEvent.count({ where: { type: "delivery_round.reordered" } }),
    ).toBe(1);
  });

  it("un ordre identique n'écrit rien : ni version, ni journal", async () => {
    const { round, stops } = await threeStops();

    await admin(ctx)
      .put(`${ROUNDS}/${round}/ordre`)
      .send({ stopIds: stops, version: 4 })
      .expect(204);

    expect((await roundOf(ctx, DAY, round)).version).toBe(4);
    expect(
      await ctx.prisma.activityEvent.count({ where: { type: "delivery_round.reordered" } }),
    ).toBe(0);
  });

  it("refuse ce qui n'est pas une permutation (400) et une version périmée (409)", async () => {
    const { round, stops } = await threeStops();
    const [a, b] = stops;

    await admin(ctx)
      .put(`${ROUNDS}/${round}/ordre`)
      .send({ stopIds: [a, b], version: 4 })
      .expect(400);
    await admin(ctx)
      .put(`${ROUNDS}/${round}/ordre`)
      .send({ stopIds: [...stops].reverse(), version: 3 })
      .expect(409);
  });

  it("🔴 relit et réécrit `closed_at` tel quel : un arrêt clos ne bouge plus (I4)", async () => {
    const { round, stops } = await threeStops();
    const [a, b, c] = stops;
    const closedAt = new Date(0);
    // Le DERNIER : les positions vivantes restent 1..n. Clore au milieu est le
    // geste du lot 6 (`closeStop`), qui resserrera ce qui reste.
    await ctx.prisma.deliveryRoundStop.update({ where: { id: c }, data: { closedAt } });

    await admin(ctx)
      .put(`${ROUNDS}/${round}/ordre`)
      .send({ stopIds: [b, a], version: 4 })
      .expect(204);
    await admin(ctx)
      .put(`${ROUNDS}/${round}/ordre`)
      .send({ stopIds: [c, a, b], version: 5 })
      .expect(409);
    await admin(ctx)
      .post(`${ROUNDS}/${round}/arrets/${c}/retrait`)
      .send({ version: 5 })
      .expect(409);

    const closed = await ctx.prisma.deliveryRoundStop.findUniqueOrThrow({ where: { id: c } });
    expect(closed).toMatchObject({ closedAt, removedAt: null, position: 3 });
    expect((await roundOf(ctx, DAY, round)).stops.map((stop) => stop.stopId)).toEqual([b, a]);
  });
});
