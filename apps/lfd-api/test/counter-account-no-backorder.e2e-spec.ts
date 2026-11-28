/**
 * E2E du **compte ouvert au comptoir sans reliquat** (plan
 * `documentation/comptes-client/plan-comptes-du-comptoir.md`, § 3.7) : un
 * départ incomplet d'une de ses commandes n'ouvre aucun reliquat, et un
 * reliquat ne s'estime ni ne se transforme pour lui.
 *
 * Le statut est posé par Prisma sur les sociétés des scènes : la vraie
 * ouverture ne crée pas d'acheteur, et un reliquat n'existe pas pour un
 * compte du comptoir — le refus d'estimer et de transformer est une défense,
 * éprouvée sur un reliquat posé par l'agrégat.
 */
import { localToInstant } from "@lfd/contracts";

import { PricingMaterialsCache } from "../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import {
  backorderDecor,
  conversionBody,
  openBackorder,
  placeOrigin,
  SKU,
  staff,
} from "./backorder-conversion-scene.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import type { E2eContext } from "./e2e-harness.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { bootstrapProductionDay, SERVICE_DAY, STAFF } from "./production-day-fixture.js";
import { accountOrder } from "./shortfall-decision-scene.js";

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
  ctx.app.get(PricingMaterialsCache).invalidate();
});

async function counterSupervisor() {
  const key = "superviseur-comptoir";
  await ctx
    .asSub(STAFF)
    .post("/admin/staff-roles")
    .send({
      key,
      label: key,
      grants: [
        { resource: "handover_counter", action: "write" },
        { resource: "b2b_orders_shortfall", action: "write" },
      ],
    })
    .expect(201);
  const sub = `staff-${key}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: key,
      email: `${key}@lfc.test`,
      role: null,
      roleKey: key,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

async function asCounterAccount(companyId: string): Promise<void> {
  await ctx.prisma.company.update({
    where: { id: companyId },
    data: { status: CompanyStatus.counter_opened },
  });
}

describe("un compte ouvert au comptoir n'a pas de reliquat", () => {
  /** Un départ incomplet décidé au comptoir ; rend le nombre de reliquats nés. */
  async function departIncomplete(counterAccount: boolean): Promise<number> {
    const order = await accountOrder(ctx, 1);
    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { companyId: true },
    });
    if (counterAccount) {
      await asCounterAccount(row.companyId ?? "");
    }
    const seller = await counterSupervisor();
    clock.set(localToInstant(SERVICE_DAY, "12:00") ?? new Date());

    await seller
      .post(`/admin/counter/orders/${order.id}/incomplete-handover`)
      .send({ remainder: "abandoned" })
      .expect(204);
    await ctx.drain();

    expect(await ctx.prisma.orderShortfallDecision.count({ where: { orderId: order.id } })).toBe(1);
    return ctx.prisma.backorder.count({ where: { originOrderId: order.id } });
  }

  it("un départ incomplet au comptoir n'ouvre aucun reliquat", async () => {
    expect(await departIncomplete(true)).toBe(0);
  });

  it("le même départ pour une société active ouvre son reliquat", async () => {
    expect(await departIncomplete(false)).toBe(1);
  });

  it("un reliquat ne s'estime ni ne se transforme pour lui", async () => {
    const decor = await backorderDecor(ctx);
    const day = SERVICE_DAY;
    const originId = await placeOrigin(ctx, decor, day, [{ sku: SKU, quantity: 10 }]);
    const backorderId = await openBackorder(ctx, decor, originId, [
      { quantity: 4, saleUnit: "piece" },
    ]);
    await asCounterAccount(decor.companyId);
    const body = conversionBody(decor, day);

    const quoted = await staff(ctx).post(`/admin/backorders/${backorderId}/quote`).send(body);
    const converted = await staff(ctx)
      .post(`/admin/backorders/${backorderId}/convert`)
      .set(INTENT_KEY, freshIntent())
      .send({ ...body, expectedTotalCents: 0 });

    expect(quoted.status).toBe(409);
    expect(JSON.stringify(quoted.body)).toContain("orders.counter.account_no_backorder");
    expect(converted.status).toBe(409);
    expect(JSON.stringify(converted.body)).toContain("orders.counter.account_no_backorder");
    expect(await ctx.prisma.order.count({ where: { companyId: decor.companyId } })).toBe(1);
  });
});
