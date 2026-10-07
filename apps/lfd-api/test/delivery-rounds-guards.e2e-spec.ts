/**
 * E2E de la **composition des tournées** — les gardes
 * (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 3).
 *
 * Les signaux d'arrêt (Q11), le retrait manuel qui libère la commande, le
 * refus de retirer un véhicule qui roule demain (C14), le droit
 * `delivery_rounds` (Q12), et deux déplacements croisés qui ne
 * s'interbloquent pas (C13).
 */
import { addDays, instantToLocal, type StaffRole } from "@lfd/contracts";

import { bootstrapE2e, serviceDay, type E2eContext } from "./e2e-harness.js";
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
  VEHICLES,
} from "./delivery-rounds-scene.js";

const DAY = serviceDay();

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

describe("les signaux d'arrêt (Q11 : retirés à la main)", () => {
  it("signale l'annulée, celle qui n'est plus de ce jour, celle passée en retrait", async () => {
    const round = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    const [cancelled, moved, pickup] = [
      await seedDelivery(ctx, DAY),
      await seedDelivery(ctx, DAY),
      await seedDelivery(ctx, DAY),
    ];
    for (const order of [cancelled, moved, pickup]) {
      await assign(ctx, DAY, round, order.id);
    }
    const later = serviceDay(9);
    await ctx.prisma.order.update({ where: { id: cancelled.id }, data: { status: "cancelled" } });
    await ctx.prisma.order.update({
      where: { id: moved.id },
      data: { requestedDeliveryDate: new Date(`${later}T00:00:00.000Z`) },
    });
    await ctx.prisma.order.update({
      where: { id: pickup.id },
      data: { fulfillmentMethod: "pickup" },
    });

    const { stops } = await roundOf(ctx, DAY, round);
    expect(
      stops.map(({ reference, signals, orderDay }) => ({ reference, signals, orderDay })),
    ).toEqual([
      { reference: cancelled.reference, signals: ["cancelled"], orderDay: DAY },
      { reference: moved.reference, signals: ["not_this_day"], orderDay: later },
      { reference: pickup.reference, signals: ["not_delivery"], orderDay: DAY },
    ]);
  });

  it("« à répartir » écarte les annulées", async () => {
    const kept = await seedDelivery(ctx, DAY);
    const cancelled = await seedDelivery(ctx, DAY);
    await ctx.prisma.order.update({ where: { id: cancelled.id }, data: { status: "cancelled" } });

    expect((await dayView(ctx, DAY)).unassigned).toEqual([
      { orderId: kept.id, reference: kept.reference },
    ]);
  });

  it("retirer à la main libère la commande : ligne gardée, commande à répartir", async () => {
    const kangoo = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    const trafic = await openRound(ctx, DAY, await addVehicle(ctx, "Trafic"));
    const order = await seedDelivery(ctx, DAY);
    const stopId = await assign(ctx, DAY, kangoo, order.id);

    await admin(ctx)
      .post(`${ROUNDS}/${kangoo}/arrets/${stopId}/retrait`)
      .send({ version: 2 })
      .expect(204);

    const row = await ctx.prisma.deliveryRoundStop.findUniqueOrThrow({ where: { id: stopId } });
    expect(row.removedAt).not.toBeNull();
    expect((await dayView(ctx, DAY)).unassigned).toEqual([
      { orderId: order.id, reference: order.reference },
    ]);
    await assign(ctx, DAY, trafic, order.id);
  });

  it("signale une tournée sur un véhicule retiré avant ce jour (C14, cas concurrent)", async () => {
    const kangoo = await addVehicle(ctx, "Kangoo");
    await openRound(ctx, DAY, kangoo);
    // Le retrait et l'affectation simultanés que le handler ne peut pas voir.
    await ctx.prisma.deliveryVehicle.update({
      where: { id: kangoo },
      data: { retiredAt: new Date(`${serviceDay(1)}T12:00:00.000Z`) },
    });

    expect((await dayView(ctx, DAY)).rounds[0]?.vehicleRetired).toBe(true);
  });
});

describe("retirer un véhicule (C14)", () => {
  it("🔴 refuse s'il porte une tournée demain, et nomme le jour", async () => {
    const tomorrow = addDays(instantToLocal(new Date()).day, 1);
    const kangoo = await addVehicle(ctx, "Kangoo");
    const round = await openRound(ctx, tomorrow, kangoo);
    await assign(ctx, tomorrow, round, (await seedDelivery(ctx, tomorrow)).id);

    const refused = await admin(ctx).post(`${VEHICLES}/${kangoo}/retrait`).expect(409);

    expect(JSON.stringify(refused.body)).toContain(tomorrow);
    const vehicle = await ctx.prisma.deliveryVehicle.findUniqueOrThrow({ where: { id: kangoo } });
    expect(vehicle.retiredAt).toBeNull();
  });

  it("laisse retirer un véhicule dont la tournée à venir a été vidée", async () => {
    const tomorrow = addDays(instantToLocal(new Date()).day, 1);
    const kangoo = await addVehicle(ctx, "Kangoo");
    await openRound(ctx, tomorrow, kangoo);

    await admin(ctx).post(`${VEHICLES}/${kangoo}/retrait`).expect(204);
  });
});

describe("le droit `delivery_rounds` (Q12)", () => {
  it("refuse le support en lecture comme en écriture (403)", async () => {
    const support = await asRole("support");
    await support.get(`${ROUNDS}?jour=${DAY}`).expect(403);
    await support.post(ROUNDS).send({ day: DAY, vehicleId: "x" }).expect(403);
  });

  it("laisse le comptoir composer", async () => {
    const kangoo = await addVehicle(ctx, "Kangoo");
    const counter = await asRole("comptoir");
    await counter.post(ROUNDS).send({ day: DAY, vehicleId: kangoo }).expect(201);
    await counter.get(`${ROUNDS}?jour=${DAY}`).expect(200);
  });
});

describe("C13 — deux déplacements croisés", () => {
  it("ne s'interbloquent pas : l'un passe, l'autre voit une version périmée", async () => {
    const a = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    const b = await openRound(ctx, DAY, await addVehicle(ctx, "Trafic"));
    const stopA = await assign(ctx, DAY, a, (await seedDelivery(ctx, DAY)).id);
    const stopB = await assign(ctx, DAY, b, (await seedDelivery(ctx, DAY)).id);

    const responses = await Promise.all([
      admin(ctx)
        .post(`${ROUNDS}/${a}/arrets/${stopA}/deplacement`)
        .send({ toRoundId: b, fromVersion: 2, toVersion: 2 }),
      admin(ctx)
        .post(`${ROUNDS}/${b}/arrets/${stopB}/deplacement`)
        .send({ toRoundId: a, fromVersion: 2, toVersion: 2 }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([204, 409]);
    const view = await dayView(ctx, DAY);
    expect(view.rounds.flatMap((round) => round.stops)).toHaveLength(2);
  });
});
