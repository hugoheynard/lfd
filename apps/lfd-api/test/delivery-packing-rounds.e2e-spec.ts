/**
 * **Le poste de colisage, rangé par tournée** (`decisions-par-defaut-2026-10-02.md`,
 * lots PC2 et PC3) — sur le vrai Postgres : les arrêts du dernier au premier,
 * « n prêtes sur m » lu du commerce, et la tournée que l'étiquette imprime.
 * Lire n'écrit rien.
 */
import type { DeliveryOrderBinsView, DeliveryPackingRoundsView, StaffRole } from "@lfd/contracts";

import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  ADMIN_VERIFIER_OVERRIDE,
  addVehicle,
  admin,
  assign,
  forgetCustomer,
  openRound,
  seedDelivery,
} from "./delivery-rounds-scene.js";
import { BINS, LOADING } from "./delivery-loading-scene.js";

const DAY = serviceDay();
const ROUNDS = `${LOADING}/colisage/tournees`;

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

/** Une tournée de trois arrêts, dans l'ordre. */
async function threeStops() {
  const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
  const orders = [
    await seedDelivery(ctx, DAY),
    await seedDelivery(ctx, DAY),
    await seedDelivery(ctx, DAY),
  ] as const;
  for (const order of orders) {
    await assign(ctx, DAY, roundId, order.id);
  }
  return { roundId, orders };
}

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

describe("GET colisage/tournees", () => {
  it("range les arrêts du dernier au premier, et compte les prêtes au serveur", async () => {
    const { roundId, orders } = await threeStops();
    // Le commerce dit « prête » : c'est sa source, pas celle du fournil.
    await ctx.prisma.order.update({ where: { id: orders[1].id }, data: { status: "ready" } });

    const view = jsonBody<DeliveryPackingRoundsView>(
      await admin(ctx).get(`${ROUNDS}?jour=${DAY}`).expect(200),
    );

    expect(view.day).toBe(DAY);
    expect(view.rounds).toHaveLength(1);
    expect(view.rounds[0]).toMatchObject({ roundId, stopCount: 3, readyStops: 1 });
    expect(
      view.rounds[0]?.stops.map((stop) => [stop.reference, stop.position, stop.ready]),
    ).toEqual([
      [orders[2].reference, 3, false],
      [orders[1].reference, 2, true],
      [orders[0].reference, 1, false],
    ]);
  });

  it("refuse un jour mal formé (400)", async () => {
    await admin(ctx).get(`${ROUNDS}?jour=demain`).expect(400);
  });

  it("s'ouvre à qui ouvre le poste (support : colisage en lecture), pas à la communication", async () => {
    await (await asRole("support")).get(`${ROUNDS}?jour=${DAY}`).expect(200);
    await (await asRole("communication")).get(`${ROUNDS}?jour=${DAY}`).expect(403);
  });
});

describe("GET colisage/bacs?commande= — l'étiquette porte la tournée (PC3)", () => {
  it("rend la tournée et la position de l'arrêt de la commande", async () => {
    const { roundId, orders } = await threeStops();

    const view = jsonBody<DeliveryOrderBinsView>(
      await admin(ctx).get(`${BINS}?commande=${orders[1].id}`).expect(200),
    );

    expect(view.round).toMatchObject({ roundId, day: DAY, position: 2, departedAt: null });
  });

  it("hors tournée : `round` vaut null", async () => {
    const order = await seedDelivery(ctx, DAY);

    const view = jsonBody<DeliveryOrderBinsView>(
      await admin(ctx).get(`${BINS}?commande=${order.id}`).expect(200),
    );

    expect(view.round).toBeNull();
  });
});
