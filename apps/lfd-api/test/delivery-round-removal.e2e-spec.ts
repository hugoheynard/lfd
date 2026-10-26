/**
 * E2E de **« Supprimer la tournée »** (décision de Hugo, 2026-10-26) — une
 * tournée créée par erreur : ses arrêts retournent « à répartir » le jour
 * même, elle sort des lectures du jour et reste en base. Et la règle posée le
 * même jour : on ne compose pas une journée passée.
 */
import type { Response } from "supertest";

import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
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
import { declareBins, LOADING, loadBin } from "./delivery-loading-scene.js";

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

function messageOf(response: Response): string {
  return jsonBody<{ message: string }>(response).message;
}

async function removeRound(roundId: string, version: number): Promise<Response> {
  return admin(ctx).post(`${ROUNDS}/${roundId}/removal`).send({ version });
}

describe("supprimer une tournée", () => {
  it("ses arrêts retournent à répartir, elle sort des lectures du jour et reste en base", async () => {
    const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    const first = await seedDelivery(ctx, DAY);
    const second = await seedDelivery(ctx, DAY);
    await assign(ctx, DAY, roundId, first.id);
    await assign(ctx, DAY, roundId, second.id);
    const { version } = await roundOf(ctx, DAY, roundId);

    await removeRound(roundId, version).then((response) => expect(response.status).toBe(204));

    const view = await dayView(ctx, DAY);
    expect(view.rounds.map((round) => round.id)).not.toContain(roundId);
    expect(view.unassigned.map((order) => order.orderId).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    const stored = await ctx.prisma.deliveryRound.findUniqueOrThrow({ where: { id: roundId } });
    expect(stored.removedAt).not.toBeNull();
    expect(await ctx.prisma.deliveryRoundStop.count({ where: { roundId, removedAt: null } })).toBe(
      0,
    );
    await admin(ctx).get(`${ROUNDS}/${roundId}/round.pdf`).expect(404);
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "delivery_round.removed" },
    });
    expect(fact.payload).toMatchObject({
      orders: [
        { id: first.id, name: first.reference },
        { id: second.id, name: second.reference },
      ],
      transfers: [],
    });
  });

  it("rejouée : 204, sans second fait", async () => {
    const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    const { version } = await roundOf(ctx, DAY, roundId);
    expect((await removeRound(roundId, version)).status).toBe(204);

    expect((await removeRound(roundId, version)).status).toBe(204);

    expect(
      await ctx.prisma.activityEvent.count({ where: { type: "delivery_round.removed" } }),
    ).toBe(1);
  });

  it("un arrêt retourné à répartir se recompose dans une autre tournée", async () => {
    const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    const order = await seedDelivery(ctx, DAY);
    await assign(ctx, DAY, roundId, order.id);
    await removeRound(roundId, (await roundOf(ctx, DAY, roundId)).version);
    const other = await openRound(ctx, DAY, await addVehicle(ctx, "Trafic"));

    await assign(ctx, DAY, other, order.id);

    expect((await roundOf(ctx, DAY, other)).stops).toHaveLength(1);
  });

  it("refuse tant qu'un bac est chargé, en disant de décharger d'abord", async () => {
    const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
    const order = await seedDelivery(ctx, DAY);
    await assign(ctx, DAY, roundId, order.id);
    const [binId] = await declareBins(ctx, order.id, 1);
    await loadBin(ctx, roundId, { binId: binId ?? "" }).expect(204);

    const refused = await removeRound(roundId, (await roundOf(ctx, DAY, roundId)).version);

    expect(refused.status).toBe(409);
    expect(messageOf(refused)).toContain("déchargez d'abord les bacs de cette tournée");
    expect((await roundOf(ctx, DAY, roundId)).stops).toHaveLength(1);
    await admin(ctx).get(`${LOADING}/loading/${roundId}`).expect(200);
  });

  it("une version périmée répond 409 « rechargez », sans rien écrire", async () => {
    const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));

    const refused = await removeRound(roundId, 99);

    expect(refused.status).toBe(409);
    expect(
      (await ctx.prisma.deliveryRound.findUniqueOrThrow({ where: { id: roundId } })).removedAt,
    ).toBeNull();
  });
});

describe("on ne compose pas une journée passée", () => {
  it("ouvrir une tournée hier est refusé (409), aujourd'hui permis", async () => {
    const vehicleId = await addVehicle(ctx, "Kangoo");

    const refused = await admin(ctx)
      .post(ROUNDS)
      .send({ day: serviceDay(-1), vehicleId })
      .expect(409);

    expect(messageOf(refused)).toContain("On ne compose pas une journée passée");
    await openRound(ctx, serviceDay(0), vehicleId);
  });
});
