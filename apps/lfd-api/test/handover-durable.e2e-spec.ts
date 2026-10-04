/**
 * Le retrait passe par la boîte d'envoi (plan
 * `documentation/journalisation/plan-evenements-durables.md`, lot E2).
 *
 * Ce que seul le vrai Postgres prouve : que `handover.handed_over` tombe avec
 * l'attestation, que le commerce en tire `fulfilled` puis `order.fulfilled`,
 * que les points et le journal suivent — et qu'un abonné qui échoue, repris par
 * le balayage, ne crédite qu'une fois ; qu'une double attestation n'a qu'un effet.
 *
 * Les commandes sont semées par Prisma, faute d'agrégat qui sache écrire une
 * commande prête et réglée (même dette que `test/factories.ts`) ; le retrait,
 * lui, passe par la vraie route du comptoir.
 */
import type { SetLoyaltySettingsPayload } from "@lfd/contracts";

import { ON_ORDER_HANDED_OVER } from "../src/b2b/orders/application/handlers/on-order-handed-over.handler.js";
import { CREDIT_POINTS_ON_HANDOVER } from "../src/b2b/loyalty/application/handlers/credit-points-on-handover.handler.js";
import { LoyaltySettingsReader } from "../src/b2b/loyalty/domain/ports/loyalty-settings.store.js";
import type { LoyaltySettings } from "../src/b2b/loyalty/domain/value-objects/loyalty-settings.js";
import { PrismaLoyaltySettingsStore } from "../src/b2b/loyalty/infrastructure/prisma-loyalty-settings.store.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const SETTINGS: SetLoyaltySettingsPayload = {
  pointsPerStep: 1_000,
  stepValueCents: 500,
  openToPublic: true,
  openToPro: false,
  voucherValidityDays: 365,
};

/** Le crédit des points a échoué — la panne qu'on injecte. */
class CreditFailed extends TypeError {}

/** Le VRAI réglage des points, derrière un interrupteur de panne. */
class FlakySettings extends LoyaltySettingsReader {
  inner: LoyaltySettingsReader | null = null;
  failuresLeft = 0;

  read(): Promise<LoyaltySettings | null> {
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      return Promise.reject(new CreditFailed("réglage des points en panne"));
    }
    if (this.inner === null) {
      return Promise.reject(new TypeError("réglage réel non branché"));
    }
    return this.inner.read();
  }
}

const settings = new FlakySettings();
let ctx: E2eContext;
let sequence = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      {
        token: AdminTokenVerifier,
        value: {
          verify: () => Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
        },
      },
      { token: LoyaltySettingsReader, value: settings },
    ],
  });
  settings.inner = ctx.app.get(PrismaLoyaltySettingsStore);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  settings.failuresLeft = 0;
  await ctx
    .asSub(E2E_STAFF_SUB)
    .put("/admin/accounting/loyalty/settings")
    .send(SETTINGS)
    .expect(204);
});

/** Une commande prête au comptoir, carte déjà encaissée. */
async function readyOrder(): Promise<{ id: string; number: string }> {
  sequence += 1;
  const number = `CMD-RETRAIT-${String(sequence)}`;
  const user = await createUser(ctx.prisma, { auth0Sub: `auth0|retrait-${String(sequence)}` });
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: number,
      placedByUserId: user.id,
      clientele: OrderClientele.public,
      status: OrderStatus.ready,
      subtotalCents: 2_340,
      totalCents: 2_340,
      paymentStatus: PaymentStatus.paid,
      stripePaymentIntentId: `pi_retrait_${String(sequence)}`,
    },
    select: { id: true },
  });
  return { id: order.id, number };
}

function handOver(reference: string) {
  return ctx.asSub(E2E_STAFF_SUB).post(`/admin/handover/manual/${reference}`);
}

async function sweep(): Promise<void> {
  await ctx
    .http()
    .post("/admin/outbox/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  await ctx.drain();
}

function statusOf(id: string) {
  return ctx.prisma.order.findUniqueOrThrow({ where: { id }, select: { status: true } });
}

function earned() {
  return ctx.prisma.loyaltyLedgerEntry.findMany({
    where: { kind: "earned" },
    select: { orderId: true, points: true },
  });
}

function facts(type: string) {
  return ctx.prisma.outboxMessage.findMany({ where: { type } });
}

function journaled() {
  return ctx.prisma.activityEvent.count({ where: { type: "order.handed_over" } });
}

describe("le retrait passe par la boîte d'envoi", () => {
  it("l'attestation écrit son fait ; le commerce clôt, crédite et journalise", async () => {
    const order = await readyOrder();

    await handOver(order.number).expect(201);
    await ctx.drain();

    expect((await facts("handover.handed_over")).map((fact) => fact.key)).toEqual([
      `handover.handed_over:${order.id}`,
    ]);
    expect((await facts("order.fulfilled")).map((fact) => fact.key)).toEqual([
      `order.fulfilled:${order.id}`,
    ]);
    expect(await statusOf(order.id)).toEqual({ status: "fulfilled" });
    expect(await earned()).toEqual([{ orderId: order.id, points: 2_340 }]);
    expect(await journaled()).toBe(1);
    const [delivery] = await ctx.prisma.outboxDelivery.findMany({
      where: { subscriber: ON_ORDER_HANDED_OVER },
    });
    expect(delivery?.deliveredAt).not.toBeNull();
  });

  it("l'abonné des points qui échoue est repris par le balayage, et ne crédite qu'une fois", async () => {
    const order = await readyOrder();
    settings.failuresLeft = 1;

    await handOver(order.number).expect(201);
    await ctx.drain();

    expect(await statusOf(order.id)).toEqual({ status: "fulfilled" });
    expect(await earned()).toEqual([]);
    const [failed] = await ctx.prisma.outboxDelivery.findMany({
      where: { subscriber: CREDIT_POINTS_ON_HANDOVER },
    });
    expect(failed).toMatchObject({ attempts: 1, deliveredAt: null });

    await ctx.prisma.outboxDelivery.updateMany({ data: { nextAttemptAt: daysAgo(1) } });
    await sweep();
    expect(await earned()).toHaveLength(1);

    // Un relais mort après l'effet : la ligne revient, la garde trouve le reçu.
    await ctx.prisma.outboxDelivery.updateMany({ data: { claimedUntil: daysAgo(1) } });
    await sweep();
    expect(await earned()).toHaveLength(1);
    expect(await journaled()).toBe(1);
  });

  it("une double attestation : un seul retrait, un seul crédit, un seul témoin", async () => {
    // Le second geste est refusé, mais RÉANNONCE le vrai retrait — un fait
    // neuf, que le commerce reçoit sans rien refaire.
    const order = await readyOrder();

    await handOver(order.number).expect(201);
    await ctx.drain();
    await handOver(order.number).expect(409);
    await ctx.drain();

    const handedOver = await facts("handover.handed_over");
    expect(handedOver).toHaveLength(2);
    expect(handedOver.filter((fact) => fact.key.includes(":reannounced:"))).toHaveLength(1);
    expect(await facts("order.fulfilled")).toHaveLength(1);
    expect(await earned()).toHaveLength(1);
    expect(await journaled()).toBe(1);
  });

  it("deux postes qui attestent ensemble : un seul effet", async () => {
    const order = await readyOrder();

    const statuses = (await Promise.all([handOver(order.number), handOver(order.number)]))
      .map((response) => response.status)
      .sort();
    await ctx.drain();

    expect(statuses).toEqual([201, 409]);
    expect(
      (await facts("handover.handed_over")).filter((fact) => !fact.key.includes(":reannounced:")),
    ).toHaveLength(1);
    expect(await facts("order.fulfilled")).toHaveLength(1);
    expect(await earned()).toHaveLength(1);
    expect(await journaled()).toBe(1);
  });
});
