import { randomUUID } from "node:crypto";
/**
 * La clôture de journée, **premier client de la boîte d'envoi** (plan
 * `documentation/journalisation/plan-boite-d-envoi.md`, §7 et §10).
 *
 * Ce que seul le vrai Postgres prouve : que le fait tombe avec la clôture, que
 * l'abonné du commerce qui échoue est repris par le balayage, qu'une livraison
 * en double n'a qu'un effet — et qu'une livraison tardive n'absorbe que
 * l'instantané, jamais une commande passée après l'arrêt.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PrismaService } from "../src/platform/database/prisma.service.js";
import { IdGenerator } from "../src/platform/id/id-generator.js";
import { SecretGenerator } from "../src/platform/secret/secret-generator.js";
import { Clock } from "../src/platform/time/clock.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import type { Order } from "../src/b2b/orders/domain/entities/order.js";
import {
  OrderRepository,
  type AbandonedSettlement,
  type PlacedOrder,
} from "../src/b2b/orders/domain/ports/order.repository.js";
import type { HandoverVia } from "../src/b2b/orders/domain/services/handover.js";
import { ON_PRODUCTION_DAY_CLOSED } from "../src/b2b/orders/application/handlers/on-production-day-closed.handler.js";
import { PrismaOrderRepository } from "../src/b2b/orders/infrastructure/prisma-order.repository.js";
import { bootstrapE2e, daysAgo, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { settleCardPayments } from "./card-payments.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const MEMBER = "auth0|member";
const STAFF = "staff-e2e";
const SERVICE_DAY = serviceDay();
const SITE = {
  label: "Boutique",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** L'abonné du commerce a échoué — la panne qu'on injecte. */
class AbsorptionFailed extends TypeError {}

/**
 * Le VRAI dépôt des commandes, derrière un interrupteur de panne sur
 * `absorbIntoPlan`. Il délègue tout le reste : seule l'absorption est éprouvée.
 * Le dépôt réel n'existe qu'après le démarrage, d'où `inner` posé ensuite.
 */
class FlakyOrders extends OrderRepository {
  inner: OrderRepository | null = null;
  failuresLeft = 0;
  absorptions = 0;

  private get real(): OrderRepository {
    if (this.inner === null) {
      throw new TypeError("dépôt réel non branché");
    }
    return this.inner;
  }

  async absorbIntoPlan(day: string, orderIds: readonly string[], at: Date): Promise<number> {
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      throw new AbsorptionFailed("absorption en panne");
    }
    this.absorptions += 1;
    return this.real.absorbIntoPlan(day, orderIds, at);
  }

  place(order: Order): Promise<PlacedOrder> {
    return this.real.place(order);
  }
  markPaid(intent: string): Promise<string | null> {
    return this.real.markPaid(intent);
  }
  markPaymentFailed(intent: string): Promise<string | null> {
    return this.real.markPaymentFailed(intent);
  }
  markAbandoned(orderId: string): Promise<AbandonedSettlement | null> {
    return this.real.markAbandoned(orderId);
  }
  failAtClosing(orderId: string): Promise<boolean> {
    return this.real.failAtClosing(orderId);
  }
  markFulfilled(reference: string, at: Date, by: string, via: HandoverVia): Promise<boolean> {
    return this.real.markFulfilled(reference, at, by, via);
  }
  markReady(reference: string, at: Date, by: string): Promise<boolean> {
    return this.real.markReady(reference, at, by);
  }
}

let intentCount = 0;
const issuedIntents: string[] = [];
const fakeGateway = {
  createIntent: () => {
    intentCount += 1;
    const id = `pi_day_closed_${String(intentCount)}`;
    issuedIntents.push(id);
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

const orders = new FlakyOrders();
let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      {
        token: AdminTokenVerifier,
        value: { verify: () => Promise.resolve({ subject: STAFF, scopes: [] }) },
      },
      { token: PaymentGateway, value: fakeGateway },
      { token: OrderRepository, value: orders },
    ],
  });
  orders.inner = new PrismaOrderRepository(
    ctx.app.get(PrismaService),
    ctx.app.get(Clock),
    ctx.app.get(IdGenerator),
    ctx.app.get(SecretGenerator),
  );
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  orders.failuresLeft = 0;
  orders.absorptions = 0;
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

async function place(): Promise<string> {
  const point = await ctx.prisma.pickupAddress.findFirst({ select: { id: true } });
  const id =
    point?.id ?? (await ctx.prisma.pickupAddress.create({ data: { ...SITE, isDefault: true } })).id;
  const placed = jsonBody<{ orderNumber: string }>(
    await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send({
        idempotencyKey: randomUUID(),
        companyId: null,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "pickup",
        pickupAddressId: id,
        note: "",
        lines: [{ sku: "VIE-001", quantity: 1 }],
      })
      .expect(201),
  );
  await settleCardPayments(ctx, issuedIntents);
  return placed.orderNumber;
}

async function closePlan(): Promise<{ readonly closedAt: string }> {
  const response = await ctx
    .asSub(STAFF)
    .post(`/admin/production/batch/${SERVICE_DAY}/close`)
    .expect(201);
  await ctx.drain();
  return jsonBody<{ readonly closedAt: string }>(response);
}

async function sweep(): Promise<void> {
  await ctx
    .http()
    .post("/admin/outbox/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  await ctx.drain();
}

async function orderOf(reference: string) {
  return ctx.prisma.order.findUniqueOrThrow({
    where: { orderNumber: reference },
    select: { status: true, confirmedAt: true },
  });
}

function deliveriesOfCommerce() {
  return ctx.prisma.outboxDelivery.findMany({ where: { subscriber: ON_PRODUCTION_DAY_CLOSED } });
}

describe("la clôture de journée passe par la boîte d'envoi", () => {
  it("la clôture écrit le fait, et le commerce confirme à l'instant d'arrêt", async () => {
    const reference = await place();

    const closure = await closePlan();

    const message = await ctx.prisma.outboxMessage.findFirstOrThrow({
      where: { type: "production.day_closed" },
    });
    expect(message.key).toBe(`production.day_closed:${SERVICE_DAY}:${closure.closedAt}`);
    expect(await orderOf(reference)).toEqual({
      status: "confirmed",
      confirmedAt: new Date(closure.closedAt),
    });
    const [delivery] = await deliveriesOfCommerce();
    expect(delivery?.deliveredAt).not.toBeNull();
  });

  it("l'abonné qui échoue est repris par le balayage, et n'agit qu'une fois", async () => {
    const reference = await place();
    orders.failuresLeft = 1;

    const closure = await closePlan();

    expect((await orderOf(reference)).status).toBe("placed");
    const [failed] = await deliveriesOfCommerce();
    expect(failed).toMatchObject({ attempts: 1, deliveredAt: null });

    await ctx.prisma.outboxDelivery.updateMany({ data: { nextAttemptAt: daysAgo(1) } });
    await sweep();
    expect(await orderOf(reference)).toEqual({
      status: "confirmed",
      confirmedAt: new Date(closure.closedAt),
    });

    // Un relais mort après l'effet : la ligne revient, la garde trouve le reçu.
    await ctx.prisma.outboxDelivery.updateMany({ data: { claimedUntil: daysAgo(1) } });
    await sweep();
    expect(orders.absorptions).toBe(1);
  });

  it("une re-clôture est un fait NEUF, qui n'absorbe que l'instantané", async () => {
    // Régression : l'absorption prenait toute la journée `placed`. Une
    // réannonce — ou une livraison reprise — confirmait donc une commande
    // passée après l'arrêt, que le fournil n'avait jamais comptée.
    const counted = await place();
    await closePlan();
    const late = await place();

    await closePlan();

    expect(await ctx.prisma.outboxMessage.count({ where: { type: "production.day_closed" } })).toBe(
      2,
    );
    expect((await orderOf(counted)).status).toBe("confirmed");
    expect((await orderOf(late)).status).toBe("placed");
  });

  it("une re-clôture après un retirage fait apprendre au commerce les commandes reprises", async () => {
    await place();
    await closePlan();
    const late = await place();
    await ctx.asSub(STAFF).post(`/admin/production/worksheet/${SERVICE_DAY}/retake`).expect(201);

    await closePlan();

    expect((await orderOf(late)).status).toBe("confirmed");
  });

  it("deux clôtures concurrentes ne ferment qu'UNE fois", async () => {
    // Régression (constatée le 2026-10-06, lot A0) : la journée était chargée
    // hors verrou, et deux clics simultanés fermaient tous les deux.
    await place();

    const responses = await Promise.all([
      ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/close`).expect(201),
      ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/close`).expect(201),
    ]);
    await ctx.drain();

    const flags = responses
      .map((response) => jsonBody<{ readonly alreadyClosed: boolean }>(response).alreadyClosed)
      .sort();
    expect(flags).toEqual([false, true]);
    expect(await ctx.prisma.activityEvent.count({ where: { type: "production_day.closed" } })).toBe(
      1,
    );
    const keys = (
      await ctx.prisma.outboxMessage.findMany({
        where: { type: "production.day_closed" },
        select: { key: true },
      })
    ).map((message) => message.key);
    expect(keys).toHaveLength(2);
    expect(keys.filter((key) => !key.includes(":reannounced:"))).toHaveLength(1);
  });
});
