/**
 * E2E de la **naissance du reliquat** (lot B2, plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 3) : la
 * décision du départ incomplet — par les managers ou au comptoir — fait
 * naître, dans sa transaction, un reliquat `open` de ce qui n'est pas parti,
 * et `backorder.opened` au journal.
 *
 * Ce que seul le vrai Postgres prouve : l'origine se relit sous le verrou de
 * la décision, le reliquat et le fait s'écrivent avec elle, et une seconde
 * décision refusée n'en fait pas naître un second.
 */
import { localToInstant } from "@lfd/contracts";
import type request from "supertest";

import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { settleCardPayments } from "./card-payments.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import type { E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { pickupSite, placeOrder } from "./order-factory.js";
import {
  bootstrapProductionDay,
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";
import { accountOrder, decide, drawn, report } from "./shortfall-decision-scene.js";

const clock = new FixedClock(new Date());
let ctx: E2eContext;
let issued: string[];

beforeAll(async () => {
  ({ ctx, issued } = await bootstrapProductionDay([
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

async function backordersOf(orderId: string) {
  return ctx.prisma.backorder.findMany({ where: { originOrderId: orderId } });
}

async function openedFactsOf(orderId: string) {
  return ctx.prisma.activityEvent.findMany({
    where: { type: "backorder.opened", subjectId: orderId },
  });
}

/** Le comptoir ET la décision d'un départ incomplet — le superviseur. */
async function counterSupervisor(): Promise<request.Agent> {
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

describe("La naissance du reliquat, dans la décision du départ (B2)", () => {
  it("décision des managers : un reliquat ouvert du reste, et le fait au journal", async () => {
    const order = await accountOrder(ctx, 1);
    expect(await report(ctx, order.id)).toBe(204);

    expect((await decide(ctx, order.id)).status).toBe(204);

    const [backorder, ...others] = await backordersOf(order.id);
    expect(others).toEqual([]);
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(backorder).toMatchObject({
      state: "open",
      companyId: row.companyId,
      buyerUserId: row.placedByUserId,
      lines: [{ sku: CROISSANT, quantity: 2, sale_unit: "piece" }],
      convertedOrderId: null,
      closedAt: null,
    });
    const facts = await openedFactsOf(order.id);
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toMatchObject({
      lines: [{ sku: CROISSANT, quantity: 2, saleUnit: "piece" }],
    });
  });

  it("départ décidé au comptoir : le même reliquat naît", async () => {
    const order = await accountOrder(ctx, 1);
    const seller = await counterSupervisor();
    clock.set(localToInstant(SERVICE_DAY, "12:00") ?? new Date());

    const response = await seller
      .post(`/admin/counter/orders/${order.id}/incomplete-handover`)
      .send({ remainder: "abandoned" });
    await ctx.drain();
    expect(response.status).toBe(204);

    const backorders = await backordersOf(order.id);
    expect(backorders).toHaveLength(1);
    expect(backorders[0]).toMatchObject({
      state: "open",
      lines: [{ sku: CROISSANT, quantity: 2, sale_unit: "piece" }],
    });
    expect(await openedFactsOf(order.id)).toHaveLength(1);
  });

  it("une commande sans société (un particulier) fait naître le sien, sans société", async () => {
    const buyer = await createUser(ctx.prisma, { auth0Sub: MEMBER });
    const placed = await placeOrder(ctx, {
      buyerUserId: buyer.id,
      forDay: SERVICE_DAY,
      fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
      lines: [{ sku: CROISSANT, quantity: 3 }],
    });
    await settleCardPayments(ctx, issued);
    const order = await drawn(ctx, placed, 1);
    await report(ctx, order.id);

    expect((await decide(ctx, order.id)).status).toBe(204);

    const backorders = await backordersOf(order.id);
    expect(backorders).toHaveLength(1);
    expect(backorders[0]).toMatchObject({
      state: "open",
      companyId: null,
      buyerUserId: buyer.id,
      lines: [{ sku: CROISSANT, quantity: 2, sale_unit: "piece" }],
    });
    expect(await openedFactsOf(order.id)).toHaveLength(1);
  });

  /**
   * « Tout parti » ne s'atteint pas par HTTP : sans manque, le signal et la
   * décision sont refusés. Le reste vide est éprouvé au niveau unitaire
   * (`backorder-remainder.spec.ts`, `backorder-opening.spec.ts`).
   */
  it("tout au bac : ni signal, ni décision, ni reliquat", async () => {
    const order = await accountOrder(ctx, 3);
    expect(await report(ctx, order.id)).toBe(409);

    expect((await decide(ctx, order.id)).status).toBe(409);

    expect(await backordersOf(order.id)).toEqual([]);
    expect(await openedFactsOf(order.id)).toEqual([]);
  });

  it("une seconde décision est refusée comme avant, sans second reliquat", async () => {
    const order = await accountOrder(ctx, 1);
    await report(ctx, order.id);
    expect((await decide(ctx, order.id)).status).toBe(204);

    expect((await decide(ctx, order.id)).status).toBe(409);

    expect(await backordersOf(order.id)).toHaveLength(1);
    expect(await openedFactsOf(order.id)).toHaveLength(1);
  });
});
