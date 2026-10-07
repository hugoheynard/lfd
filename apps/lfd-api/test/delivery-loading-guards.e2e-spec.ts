/**
 * E2E du **chargement** — les gardes
 * (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 4, v4).
 *
 * Le bon bac dans la mauvaise camionnette (L4-C2), la commande à répartir
 * d'abord, l'annulation d'un bac chargé (L4-C19), le déplacement d'un arrêt
 * chargé (L4-C5), « Partir » refusé tant qu'un arrêt n'est pas chargé (Q14,
 * L4-C17), et le droit `delivery_loading` (Q21).
 */
import type { StaffRole } from "@lfd/contracts";
import type { Response } from "supertest";

import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  addVehicle,
  ADMIN_VERIFIER_OVERRIDE,
  admin,
  openRound,
  forgetCustomer,
  ROUNDS,
  roundOf,
  seedDelivery,
} from "./delivery-rounds-scene.js";
import {
  BINS,
  binTypeId,
  composedOrder,
  declareBins,
  depart,
  LOADING,
  loadBin,
} from "./delivery-loading-scene.js";

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

/** Le message d'un refus. */
function messageOf(response: Response): string {
  return jsonBody<{ message: string }>(response).message;
}

describe("charger dans le bon véhicule", () => {
  it("refuse un bac d'une autre tournée en NOMMANT son véhicule et son jour", async () => {
    const kangoo = await composedOrder(ctx, DAY, "Kangoo blanc");
    const trafic = await composedOrder(ctx, DAY, "Trafic");
    const [binId] = await declareBins(ctx, kangoo.order.id, 1);

    const refused = await loadBin(ctx, trafic.roundId, { binId: binId ?? "" }).expect(409);

    expect(messageOf(refused)).toContain(`« Kangoo blanc », le ${DAY}`);
    expect(await ctx.prisma.deliveryBinLoad.count()).toBe(0);
  });

  it("refuse un bac dont la commande n'est dans aucune tournée : « à répartir d'abord »", async () => {
    const { roundId } = await composedOrder(ctx, DAY, "Kangoo");
    const loose = await seedDelivery(ctx, DAY);
    const [binId] = await declareBins(ctx, loose.id, 1);

    const refused = await loadBin(ctx, roundId, { binId: binId ?? "" }).expect(409);

    expect(messageOf(refused)).toContain("répartissez-la d'abord");
  });

  it("un code inconnu répond 404, un code mal formé 400", async () => {
    const { roundId } = await composedOrder(ctx, DAY, "Kangoo");

    await loadBin(ctx, roundId, { code: "ZZZZZZ" }).expect(404);
    await loadBin(ctx, roundId, { code: "ILOU" }).expect(400);
  });
});

describe("les gestes concurrents sur un même bac", () => {
  /** Relecture vitruve (2026-09-29) : sans verrou sur le bac, « annulé ET chargé » passait. */
  it("annuler et charger en même temps : jamais un bac annulé ET chargé", async () => {
    const { roundId, order } = await composedOrder(ctx, DAY, "Kangoo");
    const [binId] = await declareBins(ctx, order.id, 1);

    await Promise.all([
      admin(ctx).post(`${BINS}/${binId ?? ""}/annulation`),
      loadBin(ctx, roundId, { binId: binId ?? "" }),
    ]);

    const bin = await ctx.prisma.deliveryBin.findFirstOrThrow();
    const loaded = await ctx.prisma.deliveryBinLoad.count({ where: { loadedAt: { not: null } } });
    expect(bin.voidedAt !== null && loaded > 0).toBe(false);
  });

  /** Relecture vitruve (2026-09-29) : le second scan violait l'unicité (500). */
  it("deux scans simultanés du même bac : deux 204, une seule ligne, un seul fait", async () => {
    const { roundId, order } = await composedOrder(ctx, DAY, "Kangoo");
    const [binId] = await declareBins(ctx, order.id, 1);

    const responses = await Promise.all([
      loadBin(ctx, roundId, { binId: binId ?? "" }),
      loadBin(ctx, roundId, { binId: binId ?? "" }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([204, 204]);
    expect(await ctx.prisma.deliveryBinLoad.count()).toBe(1);
    expect(await ctx.prisma.activityEvent.count({ where: { type: "delivery_bin.loaded" } })).toBe(
      1,
    );
  });
});

describe("les bacs chargés ne bougent pas en silence", () => {
  it("refuse d'annuler un bac chargé (L4-C19)", async () => {
    const { roundId, order } = await composedOrder(ctx, DAY, "Kangoo");
    const [binId] = await declareBins(ctx, order.id, 1);
    await loadBin(ctx, roundId, { binId: binId ?? "" }).expect(204);

    const refused = await admin(ctx)
      .post(`${BINS}/${binId ?? ""}/annulation`)
      .expect(409);

    expect(messageOf(refused)).toContain("déchargez-le d'abord");
    expect((await ctx.prisma.deliveryBin.findFirstOrThrow()).voidedAt).toBeNull();
  });

  it("refuse de déplacer un arrêt qui a un bac chargé (L4-C5)", async () => {
    const from = await composedOrder(ctx, DAY, "Kangoo");
    const to = await composedOrder(ctx, DAY, "Trafic");
    const [binId] = await declareBins(ctx, from.order.id, 1);
    await loadBin(ctx, from.roundId, { binId: binId ?? "" }).expect(204);

    const refused = await admin(ctx)
      .post(`${ROUNDS}/${from.roundId}/arrets/${from.stopId}/deplacement`)
      .send({
        toRoundId: to.roundId,
        fromVersion: (await roundOf(ctx, DAY, from.roundId)).version,
        toVersion: (await roundOf(ctx, DAY, to.roundId)).version,
      })
      .expect(409);

    expect(messageOf(refused)).toContain("déchargez-le d'abord");
    const stop = await ctx.prisma.deliveryRoundStop.findUniqueOrThrow({
      where: { id: from.stopId },
    });
    expect(stop.roundId).toBe(from.roundId);
  });
});

describe("« Partir » refusé tant qu'un arrêt n'est pas chargé (Q14)", () => {
  it("refuse un arrêt non étiqueté, en citant sa référence (L4-C17)", async () => {
    const { roundId, order } = await composedOrder(ctx, DAY, "Kangoo");

    const refused = await depart(ctx, roundId);

    expect(refused.status).toBe(409);
    expect(messageOf(refused)).toContain(`sans bac déclaré : ${order.reference}`);
    expect(
      (await ctx.prisma.deliveryRound.findUniqueOrThrow({ where: { id: roundId } })).departedAt,
    ).toBeNull();
    expect(await ctx.prisma.deliveryStopExecution.count()).toBe(0);
  });

  it("refuse un arrêt partiel, en citant sa référence", async () => {
    const { roundId, order } = await composedOrder(ctx, DAY, "Kangoo");
    const [binId] = await declareBins(ctx, order.id, 2);
    await loadBin(ctx, roundId, { binId: binId ?? "" }).expect(204);

    const refused = await depart(ctx, roundId);

    expect(refused.status).toBe(409);
    expect(messageOf(refused)).toContain(`restent à charger : ${order.reference}`);
  });

  it("refuse une commande annulée depuis la composition, et une tournée vide", async () => {
    const { roundId, order } = await composedOrder(ctx, DAY, "Kangoo");
    const [binId] = await declareBins(ctx, order.id, 1);
    await loadBin(ctx, roundId, { binId: binId ?? "" }).expect(204);
    await ctx.prisma.order.update({ where: { id: order.id }, data: { status: "cancelled" } });

    const refused = await depart(ctx, roundId);
    expect(refused.status).toBe(409);
    expect(messageOf(refused)).toContain(`${order.reference} a été annulée`);

    const empty = await openRound(ctx, DAY, await addVehicle(ctx, "Trafic"));
    const vide = await depart(ctx, empty);
    expect(vide.status).toBe(409);
    expect(messageOf(vide)).toContain("tournée vide");
  });

  it("un bac annulé ne manque pas : on part avec les autres", async () => {
    const { roundId, order } = await composedOrder(ctx, DAY, "Kangoo");
    const [kept, extra] = await declareBins(ctx, order.id, 2);
    await admin(ctx)
      .post(`${BINS}/${extra ?? ""}/annulation`)
      .expect(204);
    await loadBin(ctx, roundId, { binId: kept ?? "" }).expect(204);

    expect((await depart(ctx, roundId)).status).toBe(204);
  });
});

describe("le droit `delivery_loading` (Q21)", () => {
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

  it("le support ne lit ni n'écrit le chargement (403)", async () => {
    const { roundId, order } = await composedOrder(ctx, DAY, "Kangoo");
    const support = await asRole("support");

    await support.get(`${LOADING}/chargement/${roundId}`).expect(403);
    await support.get(`${LOADING}/chargement?jour=${DAY}`).expect(403);
    await support
      .post(BINS)
      .send({
        orderId: order.id,
        binTypeId: await binTypeId(ctx),
        whole: 1,
        half: false,
        innerBags: 0,
      })
      .expect(403);
    await support.post(`${LOADING}/tournees/${roundId}/depart`).send({ version: 1 }).expect(403);
    expect(await ctx.prisma.deliveryBin.count()).toBe(0);
  });

  it("le comptoir déclare et charge", async () => {
    const { roundId, order } = await composedOrder(ctx, DAY, "Kangoo");
    const counter = await asRole("comptoir");

    const declared = await counter
      .post(BINS)
      .send({
        orderId: order.id,
        binTypeId: await binTypeId(ctx),
        whole: 1,
        half: false,
        innerBags: 0,
      })
      .expect(201);
    const [binId] = jsonBody<{ binIds: string[] }>(declared).binIds;
    await counter.post(`${LOADING}/chargement/${roundId}/bacs`).send({ binId }).expect(204);
  });
});
