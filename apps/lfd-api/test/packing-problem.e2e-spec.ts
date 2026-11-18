/**
 * **« Problème » et « Pièces retrouvées »** au colisage simple d'un retrait
 * (plan `documentation/colisage/plan-niveaux-de-suivi-colisage.md`, D5, D6),
 * sur le vrai Postgres : le sac ajusté à ce qui est là, l'absent mis de côté
 * dans la réserve (`packing_stock.missing`), le manque déclaré au commerce,
 * et les refus — une commande retirée par le client ne se rouvre plus.
 *
 * Le jour du comptoir est celui de l'horloge, gelée le jour de service de la
 * scène, à midi, avant le retrait.
 */
import type { PackingSheet } from "@lfd/contracts";
import { localToInstant } from "@lfd/contracts";
import { ulid } from "ulid";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import type { E2eContext } from "./e2e-harness.js";
import { DeferredTerm } from "../src/platform/database/client/client.js";
import { E2E_STAFF_ID } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";
import { pickupSite, placeOrderForCustomer } from "./order-factory.js";
import { PACKING_SETTINGS } from "./packing-settings-scene.js";
import {
  bagLines,
  bootstrapProductionDay,
  closeOrder,
  closePlan,
  CROISSANT,
  MEMBER,
  packingOrderPath,
  recordBatch,
  SERVICE_DAY,
  sheetOf,
  STAFF,
} from "./production-day-fixture.js";
import { accountOrder, type Drawn, SCENE_DELIVERY } from "./shortfall-decision-scene.js";

const clock = new FixedClock(new Date());
let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay([
    ADMIN_VERIFIER_OVERRIDE,
    { token: Clock, value: clock },
  ]));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  clock.set(new Date());
});

async function problem(
  orderId: string,
  present: number,
): Promise<{ status: number; code: unknown }> {
  const response = await ctx
    .asSub(STAFF)
    .post(`${packingOrderPath(orderId)}/problem`)
    .set(INTENT_KEY, freshIntent())
    .send({ lines: [{ sku: CROISSANT, present }] });
  await ctx.drain();
  return { status: response.status, code: (response.body as { code?: unknown }).code };
}

async function found(orderId: string, quantity: number): Promise<number> {
  const response = await ctx
    .asSub(STAFF)
    .post(`${packingOrderPath(orderId)}/found`)
    .set(INTENT_KEY, freshIntent())
    .send({ lines: [{ sku: CROISSANT, quantity }] });
  return response.status;
}

async function reserve(): Promise<{ readonly packed: number; readonly missing: number }> {
  return ctx.prisma.packingStock.findUniqueOrThrow({
    where: { serviceDay_sku: { serviceDay: SERVICE_DAY, sku: CROISSANT } },
    select: { packed: true, missing: true },
  });
}

async function shortfallLinesOf(orderId: string): Promise<unknown> {
  const row = await ctx.prisma.orderShortfall.findUniqueOrThrow({
    where: { orderId_rank: { orderId, rank: 1 } },
    select: { lines: true },
  });
  return row.lines;
}

/** « Remettre la commande » au comptoir, saisie — puis la boîte d'envoi relayée. */
async function handOver(order: Drawn): Promise<void> {
  clock.set(localToInstant(SERVICE_DAY, "12:00") ?? new Date());
  await ctx.asSub(STAFF).post(`/admin/handover/manual/${order.orderNumber}`).send({}).expect(201);
  await ctx.drain();
}

/** Deux retraits de 3 croissants, inscrits ; le four n'en remet que `baked`. */
async function twoOrders(baked: number): Promise<readonly [PackingSheet, PackingSheet]> {
  const company = await createCompany(ctx.prisma);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const buyer = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  await attachTo(ctx.prisma, buyer.id, company.id);
  const site = await pickupSite(ctx.prisma);
  const placed = [];
  for (let index = 0; index < 2; index += 1) {
    placed.push(
      await placeOrderForCustomer(ctx, {
        buyerUserId: buyer.id,
        companyId: company.id,
        staffUserId: E2E_STAFF_ID,
        settlement: "account",
        forDay: SERVICE_DAY,
        fulfillment: { method: "pickup", pickupSiteId: site },
        lines: [{ sku: CROISSANT, quantity: 3 }],
      }),
    );
  }
  await closePlan(ctx);
  await ctx.drain();
  expect(await recordBatch(ctx, ulid(), baked)).toBe(204);
  await ctx.drain();
  const [first, second] = placed;
  if (first === undefined || second === undefined) {
    throw new Error("La scène devait passer deux commandes.");
  }
  return [await sheetOf(ctx, first.orderNumber), await sheetOf(ctx, second.orderNumber)];
}

describe("« Problème » au colisage simple d'un retrait", () => {
  it("sur une fiche ouverte : le sac porte ce qui est là, l'absent est mis de côté, le manque part", async () => {
    const order = await accountOrder(ctx, 0);

    expect(await problem(order.id, 1)).toMatchObject({ status: 204 });

    expect(await reserve()).toEqual({ packed: 1, missing: 2 });
    const sheet = await sheetOf(ctx, order.orderNumber);
    expect(sheet.shortfallReportedAt).not.toBeNull();
    expect(sheet.packedAt).toBeNull();
    expect(await shortfallLinesOf(order.id)).toEqual([{ sku: CROISSANT, due: 3, packed: 1 }]);
  });

  it("sur une fiche fermée : le sac se rouvre, l'absent en sort et est mis de côté", async () => {
    const order = await accountOrder(ctx, 3);
    expect(await closeOrder(ctx, order.id)).toBe(204);
    await ctx.drain();

    expect(await problem(order.id, 2)).toMatchObject({ status: 204 });

    expect(await reserve()).toEqual({ packed: 2, missing: 1 });
    const sheet = await sheetOf(ctx, order.orderNumber);
    expect(sheet.packedAt).toBeNull();
    expect(await shortfallLinesOf(order.id)).toEqual([{ sku: CROISSANT, due: 3, packed: 2 }]);
  });

  it("une fiche fermée puis retirée par le client ne se rouvre plus", async () => {
    const order = await accountOrder(ctx, 3);
    expect(await closeOrder(ctx, order.id)).toBe(204);
    await ctx.drain();
    await handOver(order);
    const row = await ctx.prisma.packingOrder.findFirstOrThrow({
      where: { orderId: order.id, rank: 1 },
      select: { handedOverAt: true },
    });
    expect(row.handedOverAt).not.toBeNull();

    expect(await problem(order.id, 2)).toEqual({ status: 409, code: "packing.sheet.handed_over" });
    const reopen = await ctx.asSub(STAFF).post(`${packingOrderPath(order.id)}/reopen`);
    expect(reopen.status).toBe(409);
    expect(reopen.body).toMatchObject({ code: "packing.sheet.handed_over" });
    expect(await reserve()).toEqual({ packed: 3, missing: 0 });
  });

  it("refuse une livraison", async () => {
    await ctx.prisma.deliveryZone.create({
      data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
    });
    const order = await accountOrder(ctx, 0, [], SCENE_DELIVERY);

    expect(await problem(order.id, 1)).toEqual({
      status: 409,
      code: "packing.problem.not_simple_pickup",
    });
  });

  it("refuse un retrait réglé en suivi détaillé", async () => {
    await admin(ctx)
      .put(PACKING_SETTINGS)
      .send({ halfSharing: false, pickupTrackingLevel: "detailed" })
      .expect(204);
    const order = await accountOrder(ctx, 0);

    expect(await problem(order.id, 1)).toEqual({
      status: 409,
      code: "packing.problem.not_simple_pickup",
    });
  });

  it("l'absent n'est pas repris par une autre commande, jusqu'à ce qu'on le retrouve", async () => {
    const [first, second] = await twoOrders(3);
    expect(await bagLines(ctx, first)).toBe(204);
    expect(await closeOrder(ctx, first.orderId)).toBe(204);
    await ctx.drain();

    expect(await problem(first.orderId, 1)).toMatchObject({ status: 204 });
    expect(await reserve()).toEqual({ packed: 1, missing: 2 });

    // Sans le manquant, les deux croissants sortis du sac seraient libres.
    expect(await bagLines(ctx, second, [{ sku: CROISSANT, quantity: 1 }])).toBe(409);

    expect(await found(first.orderId, 3)).toBe(409);
    expect(await found(first.orderId, 2)).toBe(204);
    expect(await reserve()).toEqual({ packed: 1, missing: 0 });
    const refreshed = await sheetOf(ctx, second.reference);
    const bag = refreshed.containerList?.[0];
    if (bag === undefined) {
      throw new Error("La seconde commande devait avoir un sac ouvert.");
    }
    await ctx
      .asSub(STAFF)
      .post(`${packingOrderPath(second.orderId)}/containers/${bag.id}/lines/${CROISSANT}`)
      .set(INTENT_KEY, freshIntent())
      .send({ quantity: 2 })
      .expect(204);
  });
});
