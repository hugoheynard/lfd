/**
 * **« Tout est prêt »** au colisage simple d'un retrait (plan
 * `documentation/colisage/plan-niveaux-de-suivi-colisage.md`, D4), sur le vrai
 * Postgres : un sac ouvert, chaque ligne mise entière par la réserve, la
 * fiche fermée et `packing.order_packed` écrit une fois ; refusé sans rien
 * écrire quand le four n'a pas tout remis, ou quand un manque attend sa
 * décision.
 */
import { ulid } from "ulid";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { ADMIN_VERIFIER_OVERRIDE, admin } from "./delivery-rounds-scene.js";
import type { E2eContext } from "./e2e-harness.js";
import { E2E_STAFF_ID } from "./e2e-harness.js";
import { DeferredTerm } from "../src/platform/database/client/client.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";
import { pickupSite, placeOrderForCustomer } from "./order-factory.js";
import { PACKING_SETTINGS } from "./packing-settings-scene.js";
import {
  bootstrapProductionDay,
  closePlan,
  CROISSANT,
  MEMBER,
  packingOrderPath,
  recordBatch,
  SERVICE_DAY,
  sheetOf,
  STAFF,
} from "./production-day-fixture.js";
import { accountOrder, SCENE_DELIVERY } from "./shortfall-decision-scene.js";

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

interface Placed {
  readonly id: string;
  readonly orderNumber: string;
}

/** Un retrait de 3 croissants, inscrit au colisage ; le four en remet `baked`. */
async function pickupOrder(baked: number): Promise<Placed> {
  const company = await createCompany(ctx.prisma);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const buyer = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  await attachTo(ctx.prisma, buyer.id, company.id);
  const placed = await placeOrderForCustomer(ctx, {
    buyerUserId: buyer.id,
    companyId: company.id,
    staffUserId: E2E_STAFF_ID,
    settlement: "account",
    forDay: SERVICE_DAY,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: CROISSANT, quantity: 3 }],
  });
  await closePlan(ctx);
  await ctx.drain();
  if (baked > 0) {
    expect(await recordBatch(ctx, ulid(), baked)).toBe(204);
    await ctx.drain();
  }
  return placed;
}

async function allReady(
  orderId: string,
  key = freshIntent(),
): Promise<{ status: number; code: unknown; message: unknown }> {
  const response = await ctx
    .asSub(STAFF)
    .post(`${packingOrderPath(orderId)}/all-ready`)
    .set(INTENT_KEY, key);
  await ctx.drain();
  const body = response.body as { code?: unknown; message?: unknown };
  return { status: response.status, code: body.code, message: body.message };
}

async function reserve(): Promise<{ readonly packed: number; readonly missing: number }> {
  return ctx.prisma.packingStock.findUniqueOrThrow({
    where: { serviceDay_sku: { serviceDay: SERVICE_DAY, sku: CROISSANT } },
    select: { packed: true, missing: true },
  });
}

async function factsOf(type: string, orderId: string): Promise<number> {
  return ctx.prisma.outboxMessage.count({ where: { type, key: { contains: orderId } } });
}

describe("« Tout est prêt » au colisage simple d'un retrait", () => {
  it("ferme la fiche dans un sac et publie `packing.order_packed` une fois", async () => {
    const order = await pickupOrder(3);
    expect(await sheetOf(ctx, order.orderNumber)).toMatchObject({
      trackingLevel: "simple",
      allReadyAvailable: true,
    });

    expect(await allReady(order.id)).toMatchObject({ status: 204 });

    const sheet = await sheetOf(ctx, order.orderNumber);
    expect(sheet.packedAt).not.toBeNull();
    expect(sheet.allReadyAvailable).toBe(false);
    expect(sheet.containerList).toEqual([
      expect.objectContaining({
        nature: "bag",
        lines: [expect.objectContaining({ sku: CROISSANT, quantity: 3 })],
      }),
    ]);
    expect(await reserve()).toEqual({ packed: 3, missing: 0 });
    expect(await factsOf("packing.order_packed", order.id)).toBe(1);
  });

  it("refuse quand le four n'a pas tout remis, nomme ce qui manque, et n'écrit rien", async () => {
    const order = await pickupOrder(2);
    expect((await sheetOf(ctx, order.orderNumber)).allReadyAvailable).toBe(false);

    const refused = await allReady(order.id);

    expect(refused).toMatchObject({ status: 409, code: "packing.all_ready.not_arrived" });
    expect(String(refused.message)).toContain("1");
    const sheet = await sheetOf(ctx, order.orderNumber);
    expect(sheet.packedAt).toBeNull();
    expect(sheet.containerList).toEqual([]);
    expect(await reserve()).toEqual({ packed: 0, missing: 0 });
    expect(await factsOf("packing.order_packed", order.id)).toBe(0);

    expect(await recordBatch(ctx, ulid(), 1)).toBe(204);
    await ctx.drain();
    expect((await sheetOf(ctx, order.orderNumber)).allReadyAvailable).toBe(true);
  });

  it("rejouée avec la même clé ne refait rien ; une clé neuve réannonce sans erreur", async () => {
    const order = await pickupOrder(3);
    const key = freshIntent();

    expect(await allReady(order.id, key)).toMatchObject({ status: 204 });
    expect(await allReady(order.id, key)).toMatchObject({ status: 204 });
    expect(await factsOf("packing.order_packed", order.id)).toBe(1);

    expect(await allReady(order.id)).toMatchObject({ status: 204 });
    expect(await reserve()).toEqual({ packed: 3, missing: 0 });
  });

  it("refuse un manque qui attend sa décision, puis ferme et l'efface une fois les pièces retrouvées", async () => {
    const order = await pickupOrder(3);
    await ctx
      .asSub(STAFF)
      .post(`${packingOrderPath(order.id)}/problem`)
      .set(INTENT_KEY, freshIntent())
      .send({ lines: [{ sku: CROISSANT, present: 1 }] })
      .expect(204);
    await ctx.drain();

    expect(await allReady(order.id)).toMatchObject({
      status: 409,
      code: "packing.shortfall.awaiting_decision",
    });
    expect(await reserve()).toEqual({ packed: 1, missing: 2 });

    await ctx
      .asSub(STAFF)
      .post(`${packingOrderPath(order.id)}/found`)
      .set(INTENT_KEY, freshIntent())
      .send({ lines: [{ sku: CROISSANT, quantity: 2 }] })
      .expect(204);
    expect(await allReady(order.id)).toMatchObject({ status: 204 });
    expect(await reserve()).toEqual({ packed: 3, missing: 0 });
    expect(await factsOf("packing.shortfall_cleared", order.id)).toBe(1);
  });

  it("refuse une livraison", async () => {
    await ctx.prisma.deliveryZone.create({
      data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
    });
    const order = await accountOrder(ctx, 0, [], SCENE_DELIVERY);
    // Une livraison n'a pas de niveau figé : le poste la sert détaillée, sans le bouton.
    expect(await sheetOf(ctx, order.orderNumber)).toMatchObject({
      trackingLevel: "detailed",
      allReadyAvailable: false,
    });

    expect(await allReady(order.id)).toMatchObject({
      status: 409,
      code: "packing.all_ready.not_simple_pickup",
    });
  });

  it("refuse un retrait réglé en suivi détaillé", async () => {
    await admin(ctx)
      .put(PACKING_SETTINGS)
      .send({ halfSharing: false, pickupTrackingLevel: "detailed" })
      .expect(204);
    const order = await pickupOrder(3);
    expect(await sheetOf(ctx, order.orderNumber)).toMatchObject({
      trackingLevel: "detailed",
      allReadyAvailable: false,
    });

    expect(await allReady(order.id)).toMatchObject({
      status: 409,
      code: "packing.all_ready.not_simple_pickup",
    });
    expect(await reserve()).toEqual({ packed: 0, missing: 0 });
  });
});
