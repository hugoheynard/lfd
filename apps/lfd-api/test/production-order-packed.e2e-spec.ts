import { randomUUID } from "node:crypto";
/**
 * Le colisage passe par la boîte d'envoi (plan
 * `documentation/journalisation/plan-evenements-durables.md`, lot E1).
 *
 * Ce que seul le vrai Postgres prouve : que le fait tombe avec le colisage,
 * qu'un abonné du commerce qui échoue est repris par le balayage sans agir deux
 * fois, et que deux postes qui scannent ensemble n'écrivent qu'un colisage.
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
import { ON_ORDER_PACKED } from "../src/b2b/orders/application/handlers/on-order-packed.handler.js";
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
class ReadyFailed extends TypeError {}

/**
 * Le VRAI dépôt des commandes, derrière un interrupteur de panne sur
 * `markReady`, qui compte aussi les écritures GAGNÉES — l'effet observé.
 */
class FlakyOrders extends OrderRepository {
  inner: OrderRepository | null = null;
  failuresLeft = 0;
  readyWrites = 0;

  private get real(): OrderRepository {
    if (this.inner === null) {
      throw new TypeError("dépôt réel non branché");
    }
    return this.inner;
  }

  async markReady(reference: string, at: Date, by: string): Promise<boolean> {
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      throw new ReadyFailed("colisage du commerce en panne");
    }
    const won = await this.real.markReady(reference, at, by);
    if (won) {
      this.readyWrites += 1;
    }
    return won;
  }

  absorbIntoPlan(day: string, orderIds: readonly string[], at: Date): Promise<number> {
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
}

let intentCount = 0;
const issuedIntents: string[] = [];
const fakeGateway = {
  createIntent: () => {
    intentCount += 1;
    const id = `pi_order_packed_${String(intentCount)}`;
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
  orders.readyWrites = 0;
  await createUser(ctx.prisma, { auth0Sub: MEMBER });
});

/** Passe une commande payée, arrête la journée, et rend sa référence. */
async function placeAndClose(): Promise<string> {
  const point =
    (await ctx.prisma.pickupAddress.findFirst({ select: { id: true } })) ??
    (await ctx.prisma.pickupAddress.create({ data: { ...SITE, isDefault: true } }));
  const placed = jsonBody<{ orderNumber: string }>(
    await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send({
        idempotencyKey: randomUUID(),
        companyId: null,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "pickup",
        pickupAddressId: point.id,
        note: "",
        lines: [{ sku: "VIE-001", quantity: 1 }],
      })
      .expect(201),
  );
  await settleCardPayments(ctx, issuedIntents);
  await ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/close`).expect(201);
  await ctx.drain();
  return placed.orderNumber;
}

function packing(reference: string) {
  return ctx.asSub(STAFF).post(`/admin/production/batch/${SERVICE_DAY}/sheets/${reference}/packed`);
}

async function sweep(): Promise<void> {
  await ctx
    .http()
    .post("/admin/outbox/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  await ctx.drain();
}

async function readinessOf(reference: string) {
  return ctx.prisma.order.findUniqueOrThrow({
    where: { orderNumber: reference },
    select: { id: true, status: true, readyAt: true },
  });
}

function packedFacts() {
  return ctx.prisma.outboxMessage.findMany({ where: { type: "production.order_packed" } });
}

describe("le colisage passe par la boîte d'envoi", () => {
  it("le colisage écrit le fait, et le commerce déclare la commande prête", async () => {
    const reference = await placeAndClose();

    const ack = jsonBody<{ packedAt: string }>(await packing(reference).expect(201));
    await ctx.drain();

    const order = await readinessOf(reference);
    const [fact] = await packedFacts();
    expect(fact?.key).toBe(`production.order_packed:${order.id}`);
    expect(order).toMatchObject({ status: "ready", readyAt: new Date(ack.packedAt) });
    const [delivery] = await ctx.prisma.outboxDelivery.findMany({
      where: { subscriber: ON_ORDER_PACKED },
    });
    expect(delivery?.deliveredAt).not.toBeNull();
  });

  it("l'abonné qui échoue est repris par le balayage, et n'agit qu'une fois", async () => {
    const reference = await placeAndClose();
    orders.failuresLeft = 1;

    await packing(reference).expect(201);
    await ctx.drain();

    expect((await readinessOf(reference)).status).toBe("confirmed");
    const [failed] = await ctx.prisma.outboxDelivery.findMany({
      where: { subscriber: ON_ORDER_PACKED },
    });
    expect(failed).toMatchObject({ attempts: 1, deliveredAt: null });

    await ctx.prisma.outboxDelivery.updateMany({ data: { nextAttemptAt: daysAgo(1) } });
    await sweep();
    expect((await readinessOf(reference)).status).toBe("ready");

    // Un relais mort après l'effet : la ligne revient, la garde trouve le reçu.
    await ctx.prisma.outboxDelivery.updateMany({ data: { claimedUntil: daysAgo(1) } });
    await sweep();
    expect(orders.readyWrites).toBe(1);
    expect(await ctx.prisma.activityEvent.count({ where: { type: "order.ready" } })).toBe(1);
  });

  it("deux postes qui scannent ensemble : un seul colisage, un seul effet", async () => {
    const reference = await placeAndClose();

    await Promise.all([packing(reference).expect(201), packing(reference).expect(201)]);
    await ctx.drain();

    // Le fait du colisage est unique par sa clé. Un scan qui arrive APRÈS la
    // validation du gagnant est un rescan, donc un fait de réannonce — dont la
    // livraison ne fait rien sur une commande déjà prête.
    const facts = await packedFacts();
    expect(facts.filter((fact) => !fact.key.includes(":reannounced:"))).toHaveLength(1);
    expect(orders.readyWrites).toBe(1);
    expect(await ctx.prisma.activityEvent.count({ where: { type: "order.ready" } })).toBe(1);
    expect((await readinessOf(reference)).status).toBe("ready");
  });

  it("un rescan est un fait NEUF, livré sans second effet", async () => {
    // Régression : `MarkOrderReadyCommand` refusait une commande déjà prête. Le
    // fait du rescan échouait à chaque essai, puis restait en message mort.
    const reference = await placeAndClose();
    await packing(reference).expect(201);
    await ctx.drain();

    await packing(reference).expect(201);
    await ctx.drain();

    expect(await packedFacts()).toHaveLength(2);
    const deliveries = await ctx.prisma.outboxDelivery.findMany({
      where: { subscriber: ON_ORDER_PACKED },
    });
    expect(deliveries.map((delivery) => delivery.deliveredAt === null)).toEqual([false, false]);
    expect(orders.readyWrites).toBe(1);
  });
});
