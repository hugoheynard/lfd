/**
 * **Les bacs typés, les moitiés et le bac partagé** (plan de tournée, lot 4
 * bis, v2-4, tranche B) — sur le vrai Postgres : la déclaration typée, le
 * CHECK et l'index des moitiés, le partage refusé hors de deux arrêts
 * consécutifs, « à refaire » après une recomposition et « Partir » qui le
 * refuse, le scan d'une moitié.
 */
import type { DeliveryBinView } from "@lfd/contracts";

import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  ADMIN_VERIFIER_OVERRIDE,
  addVehicle,
  admin,
  assign,
  forgetCustomer,
  openRound,
  ROUNDS,
  roundOf,
  seedDelivery,
} from "./delivery-rounds-scene.js";
import {
  BINS,
  binTypeId,
  declareTypedBins,
  depart,
  LOADING,
  loadBin,
  loadingOf,
  orderBins,
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

/** Une tournée de trois arrêts, dans l'ordre o1, o2, o3. */
async function threeStops() {
  const roundId = await openRound(ctx, DAY, await addVehicle(ctx, "Kangoo"));
  const orders = [
    await seedDelivery(ctx, DAY),
    await seedDelivery(ctx, DAY),
    await seedDelivery(ctx, DAY),
  ] as const;
  const stopIds: string[] = [];
  for (const order of orders) {
    stopIds.push(await assign(ctx, DAY, roundId, order.id));
  }
  return { roundId, orders, stopIds };
}

/** La moitié déclarée seule pour une commande ; rend son identifiant. */
async function halfFor(orderId: string): Promise<string> {
  const [binId] = await declareTypedBins(ctx, { orderId, whole: 0, half: true, innerBags: 1 });
  return binId ?? "";
}

function share(orderId: string, partnerBinId: string) {
  return admin(ctx).post(`${BINS}/partage`).send({ orderId, partnerBinId, innerBags: 2 });
}

describe("déclarer des bacs typés", () => {
  it("des entiers puis une moitié, d'un type, avec les sacs posés dedans", async () => {
    const { orders } = await threeStops();
    const typeId = await binTypeId(ctx);

    await declareTypedBins(ctx, { orderId: orders[0].id, whole: 2, half: true, innerBags: 3 });

    const { bins } = await orderBins(ctx, orders[0].id);
    expect(
      bins.map(({ half, innerBags, index, total, binType }) => ({
        half,
        innerBags,
        index,
        total,
        type: binType.id,
      })),
    ).toEqual([
      { half: null, innerBags: 3, index: 1, total: 3, type: typeId },
      { half: null, innerBags: 3, index: 2, total: 3, type: typeId },
      { half: "left", innerBags: 3, index: 3, total: 3, type: typeId },
    ]);
    expect(bins[2]?.physicalBinId).not.toBeNull();
    expect(bins[0]?.physicalBinId).toBeNull();
    expect(await ctx.prisma.activityEvent.count({ where: { type: "delivery_bin.declared" } })).toBe(
      1,
    );
  });

  it("refuse une moitié d'un type sans cloison, et un type archivé (409), sans rien écrire", async () => {
    const { orders } = await threeStops();
    const rigid = await binTypeId(ctx, "Bac S rigide", { divisible: false });
    const old = await binTypeId(ctx, "Bac ancien");
    await admin(ctx).post(`${LOADING}/bacs/${old}/archiver`).expect(204);

    const body = { orderId: orders[0].id, innerBags: 0 };
    await admin(ctx)
      .post(BINS)
      .send({ ...body, binTypeId: rigid, whole: 0, half: true })
      .expect(409);
    await admin(ctx)
      .post(BINS)
      .send({ ...body, binTypeId: old, whole: 1, half: false })
      .expect(409);
    await admin(ctx)
      .post(BINS)
      .send({ ...body, binTypeId: rigid, whole: 0, half: false })
      .expect(400);
    expect(await ctx.prisma.deliveryBin.count()).toBe(0);
  });
});

describe("l'unicité des moitiés, en base", () => {
  it("jamais deux fois la même moitié d'un bac physique ; un bac entier n'a pas de bac physique", async () => {
    const { orders } = await threeStops();
    const halfId = await halfFor(orders[0].id);
    const half = await ctx.prisma.deliveryBin.findUniqueOrThrow({ where: { id: halfId } });
    // Écrit en Prisma À DESSEIN : c'est la base qu'on éprouve, sous le domaine
    // qui refuse déjà la même chose.
    const row = { ...half, id: "e2e_dup", code: "ZZZZZ2", orderId: orders[1].id };

    await expect(ctx.prisma.deliveryBin.create({ data: row })).rejects.toThrow();
    await expect(ctx.prisma.deliveryBin.create({ data: { ...row, half: null } })).rejects.toThrow();
    await expect(
      ctx.prisma.deliveryBin.create({ data: { ...row, half: "middle" } }),
    ).rejects.toThrow();
    // Annulée, la moitié libère son côté.
    await admin(ctx).post(`${BINS}/${halfId}/annulation`).expect(204);
    await ctx.prisma.deliveryBin.create({ data: row });
  });
});

describe("le bac partagé — deux arrêts consécutifs (v2-4)", () => {
  it("partage entre voisins ; chaque moitié dit avec qui", async () => {
    const { orders } = await threeStops();
    const left = await halfFor(orders[0].id);

    const response = await share(orders[1].id, left).expect(201);
    const { binId } = jsonBody<{ binId: string }>(response);

    const [mine] = (await orderBins(ctx, orders[1].id)).bins;
    const [theirs] = (await orderBins(ctx, orders[0].id)).bins;
    expect(mine).toMatchObject<Partial<DeliveryBinView>>({ binId, half: "right", toRedo: false });
    expect(mine?.sharedWith).toMatchObject({
      orderId: orders[0].id,
      reference: orders[0].reference,
    });
    expect(theirs?.sharedWith).toMatchObject({ binId, orderId: orders[1].id });
    expect(mine?.physicalBinId).toBe(theirs?.physicalBinId);
    expect(await ctx.prisma.activityEvent.count({ where: { type: "delivery_bin.shared" } })).toBe(
      1,
    );
  });

  it("refuse hors de deux arrêts consécutifs, et une troisième moitié", async () => {
    const { orders } = await threeStops();
    const left = await halfFor(orders[0].id);

    const refused = await share(orders[2].id, left).expect(409);
    expect(JSON.stringify(refused.body)).toContain("ne sont pas à deux arrêts consécutifs");
    await share(orders[1].id, left).expect(201);
    await share(orders[1].id, left).expect(409);
    expect(await ctx.prisma.deliveryBin.count()).toBe(2);
  });

  it("à refaire après un réordonnancement ; « Partir » le refuse ; remis côte à côte, il ne l'est plus", async () => {
    const { roundId, orders, stopIds } = await threeStops();
    const left = await halfFor(orders[0].id);
    await share(orders[1].id, left).expect(201);
    await declareTypedBins(ctx, { orderId: orders[2].id, whole: 1, half: false, innerBags: 0 });
    for (const { bins } of (await loadingOf(ctx, roundId)).stops) {
      for (const bin of bins) {
        // Le scan d'une moitié : un QR = une moitié.
        await loadBin(ctx, roundId, { binId: bin.binId }).expect(204);
      }
    }
    expect((await loadingOf(ctx, roundId)).stops.map((stop) => stop.state)).toEqual([
      "loaded",
      "loaded",
      "loaded",
    ]);

    const [a, b, c] = stopIds;
    const { version } = await roundOf(ctx, DAY, roundId);
    await admin(ctx)
      .put(`${ROUNDS}/${roundId}/ordre`)
      .send({ stopIds: [a, c, b], version })
      .expect(204);

    const broken = await loadingOf(ctx, roundId);
    expect(
      broken.stops.flatMap((stop) => stop.bins.filter((bin) => bin.toRedo).map((bin) => bin.half)),
    ).toEqual(["left", "right"]);
    const refused = await depart(ctx, roundId);
    expect(refused.status).toBe(409);
    expect(JSON.stringify(refused.body)).toContain(
      "n'est plus entre deux arrêts consécutifs : recolisez-le ou remettez les arrêts côte à côte.",
    );
    expect(
      (await ctx.prisma.deliveryRound.findUniqueOrThrow({ where: { id: roundId } })).departedAt,
    ).toBeNull();

    await admin(ctx)
      .put(`${ROUNDS}/${roundId}/ordre`)
      .send({ stopIds: [a, b, c], version: broken.version })
      .expect(204);
    expect(
      (await loadingOf(ctx, roundId)).stops.some((stop) => stop.bins.some((bin) => bin.toRedo)),
    ).toBe(false);
    expect((await depart(ctx, roundId)).status).toBe(204);
  });
});
