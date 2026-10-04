/**
 * E2E du **colisage en ombre** — plan `documentation/colisage/plan-domaine-colisage.md`,
 * lot K1 (§12 corrigé par §13).
 *
 * Ce que seul le vrai Postgres prouve : que les faits tombent dans la
 * transaction du geste du fournil, que le relais les livre aux abonnés du bloc
 * `packing`, que la réserve s'additionne et n'avale chaque remise qu'une fois
 * — dans le désordre compris —, et que la route de contrôle ne voit aucun
 * écart sur une journée ordinaire. Le poste réel, lui, ne bouge pas :
 * `packing_owner` reste `legacy`.
 */
import { ON_PACKING_LIST_DRAWN } from "../src/packing/application/handlers/on-packing-list-drawn.handler.js";
import type { PackingShadowComparison } from "../src/packing/application/queries/compare-packing-shadow.query.js";
import { createUser } from "./factories.js";
import { daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
  bootstrapProductionDay,
  cancelBatch,
  closePlan,
  markLine,
  place,
  recordBatch,
  retake,
} from "./production-day-fixture.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/** Des ULID de forme valide, tirés « par l'écran ». */
const FIRST = "01K6A0000000000000000000A1";
const SECOND = "01K6A0000000000000000000B2";

let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

/** Deux bacs (8 et 4 croissants), plan arrêté, faits livrés. */
async function closedDay(): Promise<void> {
  await place(ctx, issued, [{ sku: CROISSANT, quantity: 8 }]);
  await place(ctx, issued, [{ sku: CROISSANT, quantity: 4 }]);
  await closePlan(ctx);
  await ctx.drain();
}

async function stock() {
  return ctx.prisma.packingStock.findUnique({
    where: { serviceDay_sku: { serviceDay: SERVICE_DAY, sku: CROISSANT } },
    select: { received: true, returned: true, packed: true },
  });
}

async function owner(): Promise<string> {
  return (
    await ctx.prisma.productionDay.findUniqueOrThrow({
      where: { serviceDay: SERVICE_DAY },
      select: { packingOwner: true },
    })
  ).packingOwner;
}

async function comparison(): Promise<PackingShadowComparison> {
  return jsonBody<PackingShadowComparison>(
    await ctx.asSub(STAFF).get(`/admin/packing/shadow?date=${SERVICE_DAY}`).expect(200),
  );
}

async function sweep(): Promise<void> {
  await ctx
    .http()
    .post("/admin/outbox/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  await ctx.drain();
}

describe("la clôture tire la liste à coliser", () => {
  it("l'ombre reçoit chaque commande du plan, avec ses lignes — et la journée reste `legacy`", async () => {
    await closedDay();

    const orders = await ctx.prisma.packingOrder.findMany({
      where: { serviceDay: SERVICE_DAY },
      select: { reference: true, packedAt: true, lines: { select: { sku: true, quantity: true } } },
      orderBy: { reference: "asc" },
    });
    const planned = await ctx.prisma.productionOrder.findMany({
      where: { serviceDay: SERVICE_DAY },
      select: { reference: true },
      orderBy: { reference: "asc" },
    });
    expect(orders.map((order) => order.reference)).toEqual(planned.map((order) => order.reference));
    expect(orders.flatMap((order) => order.lines.map((line) => line.quantity)).sort()).toEqual([
      4, 8,
    ]);
    expect(orders.every((order) => order.packedAt === null)).toBe(true);
    expect(await owner()).toBe("legacy");
  });

  it("le retirage n'apporte à l'ombre QUE les commandes absorbées, et garde `legacy`", async () => {
    await closedDay();
    await place(ctx, issued, [{ sku: CROISSANT, quantity: 3 }]);

    await retake(ctx);
    await ctx.drain();

    expect(await ctx.prisma.packingOrder.count({ where: { serviceDay: SERVICE_DAY } })).toBe(3);
    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "production.packing_list_drawn" } }),
    ).toBe(3);
    expect(await owner()).toBe("legacy");
  });

  it("une réannonce ne réécrit rien : même clé par commande", async () => {
    await closedDay();

    await closePlan(ctx);
    await ctx.drain();

    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "production.packing_list_drawn" } }),
    ).toBe(2);
    expect(await ctx.prisma.packingOrder.count()).toBe(2);
  });
});

describe("la remise est la sortie du four", () => {
  it("une fournée remplit la réserve, et une remise s'écrit au fournil", async () => {
    await closedDay();

    expect(await recordBatch(ctx, FIRST, 10)).toBe(204);
    await ctx.drain();

    expect(await stock()).toEqual({ received: 10, returned: 0, packed: 0 });
    expect(
      await ctx.prisma.productionHandoff.findMany({ select: { id: true, quantity: true } }),
    ).toEqual([{ id: FIRST, quantity: 10 }]);
  });

  it("une fournée déclarée DEUX fois n'est remise qu'une fois", async () => {
    await closedDay();

    expect(await Promise.all([recordBatch(ctx, FIRST, 6), recordBatch(ctx, FIRST, 6)])).toEqual([
      204, 204,
    ]);
    expect(await recordBatch(ctx, FIRST, 6)).toBe(204);
    await ctx.drain();

    expect(await ctx.prisma.productionHandoff.count()).toBe(1);
    expect(
      await ctx.prisma.outboxMessage.count({ where: { type: "production.handed_to_packing" } }),
    ).toBe(1);
    expect((await stock())?.received).toBe(6);
  });

  it("cocher la ligne remet le reste, comme une fournée", async () => {
    await closedDay();
    await recordBatch(ctx, FIRST, 5);

    expect(await markLine(ctx)).toBe(204);
    await ctx.drain();

    expect((await stock())?.received).toBe(12);
  });

  it("🔴 une remise arrivée AVANT la liste est gardée, et sert quand la liste arrive", async () => {
    await closedDay();
    // La liste n'est pas encore passée chez le colisage : ses livraisons sont
    // remises en attente, dans le futur, et l'ombre vidée de ses commandes.
    await ctx.prisma.packingLine.deleteMany();
    await ctx.prisma.packingOrder.deleteMany();
    await ctx.prisma.outboxDelivery.updateMany({
      where: { subscriber: ON_PACKING_LIST_DRAWN },
      data: { deliveredAt: null, attempts: 0, nextAttemptAt: daysAgo(-1) },
    });

    await recordBatch(ctx, FIRST, 12);
    await ctx.drain();
    expect(await ctx.prisma.packingOrder.count()).toBe(0);
    expect((await stock())?.received).toBe(12);

    await ctx.prisma.outboxDelivery.updateMany({
      where: { subscriber: ON_PACKING_LIST_DRAWN },
      data: { nextAttemptAt: daysAgo(1) },
    });
    await sweep();

    expect(await ctx.prisma.packingOrder.count()).toBe(2);
    expect((await stock())?.received).toBe(12);
    expect((await comparison()).gaps).toBe(0);
  });
});

describe("l'annulation d'une journée `legacy` reste synchrone, et l'ombre suit", () => {
  it("annuler une fournée remise : le fournil l'annule, l'ombre la rend", async () => {
    await closedDay();
    await recordBatch(ctx, FIRST, 12);
    await recordBatch(ctx, SECOND, 3);

    expect(await cancelBatch(ctx, FIRST)).toBe(204);
    await ctx.drain();

    expect(await stock()).toEqual({ received: 15, returned: 12, packed: 0 });
    const message = await ctx.prisma.outboxMessage.findFirstOrThrow({
      where: { type: "production.return_requested" },
      select: { payload: true },
    });
    expect(message.payload).toMatchObject({ requestId: `return-${FIRST}`, legacy: true });
    expect(
      await ctx.prisma.productionHandoff.findUnique({
        where: { id: `return-${FIRST}` },
        select: { quantity: true, requestId: true },
      }),
    ).toEqual({ quantity: -12, requestId: `return-${FIRST}` });
    expect(await owner()).toBe("legacy");
  });

  it("annuler deux fois ne rend qu'une fois", async () => {
    await closedDay();
    await recordBatch(ctx, FIRST, 12);

    await cancelBatch(ctx, FIRST);
    await cancelBatch(ctx, FIRST);
    await ctx.drain();

    expect((await stock())?.returned).toBe(12);
  });
});

describe("le contrôle de l'ombre", () => {
  it("une journée ordinaire : aucun écart, ligne à ligne", async () => {
    await closedDay();
    await recordBatch(ctx, FIRST, 8);
    await recordBatch(ctx, SECOND, 2);
    await ctx.drain();

    const view = await comparison();

    expect(view.gaps).toBe(0);
    expect(view.lines).toHaveLength(2);
    expect(view.lines.every((line) => line.matches)).toBe(true);
    expect(view.stocks).toEqual([{ sku: CROISSANT, legacy: 10, shadow: 10 }]);
  });

  it("une fournée qui n'a jamais été remise (l'ancien binaire) se voit en écart", async () => {
    await closedDay();
    // Ce que l'ANCIEN binaire écrivait : une fournée, sans remise ni fait.
    await ctx.prisma.productionBatch.create({
      data: {
        id: "avant-k1",
        serviceDay: SERVICE_DAY,
        sku: CROISSANT,
        quantity: 12,
        recordedAt: new Date(daysAgo(0)),
        recordedBy: "fiche-operateur-e2e",
      },
    });

    const view = await comparison();

    expect(view.gaps).toBe(2);
    expect(view.stocks).toEqual([{ sku: CROISSANT, legacy: 12, shadow: 0 }]);
  });

  it("refuse un jour hors forme", async () => {
    await ctx.asSub(STAFF).get(`/admin/packing/shadow?date=demain`).expect(400);
  });
});
