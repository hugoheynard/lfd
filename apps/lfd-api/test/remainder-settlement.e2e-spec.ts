/**
 * E2E du **solde d'une commande à son retrait** (plan E7 reliquat, lot L5b —
 * `documentation/commandes/reliquat/reliquat.md`).
 *
 * Ce que seul le vrai Postgres prouve : par les vrais gestes — la décision du
 * départ incomplet, le retrait au comptoir —, la commande se solde sur son
 * BL : solde, facture au compte, points. Le reste d'un départ incomplet
 * devient une nouvelle commande, qui a son propre solde.
 *
 * Une écriture brute, datée (2026-10-26), celle de `loyalty-partial-order` :
 * le passage à `paid`, qu'aucune route ne fait pour une commande au compte.
 */
import { MonthlyInvoicingReader } from "../src/lafoliecoffee/accounting/domain/ports/monthly-invoicing.reader.js";
import { LoyaltySettings } from "../src/lafoliecoffee/loyalty/domain/value-objects/loyalty-settings.js";
import { PrismaLoyaltySettingsStore } from "../src/lafoliecoffee/loyalty/infrastructure/prisma-loyalty-settings.store.js";
import { E2E_STAFF_ID, type E2eContext } from "./e2e-harness.js";
import { bootstrapProductionDay, closeOrder, STAFF } from "./production-day-fixture.js";
import {
  accountOrder,
  decide,
  report,
  windowAroundServiceDay,
  type Drawn,
} from "./shortfall-decision-scene.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await ctx.app.get(PrismaLoyaltySettingsStore).write(
    LoyaltySettings.of({
      pointsPerStep: 1_000,
      stepValueCents: 500,
      openToPublic: true,
      openToPro: true,
      voucherValidityDays: 365,
      welcomeBonusPoints: null,
    }),
    new Date(),
    E2E_STAFF_ID,
  );
});

/** 3 croissants commandés, 1 au bac : le manque signalé, décidé, le bac fermé. */
async function decidedOrder(): Promise<Drawn> {
  const order = await accountOrder(ctx, 1);
  expect(await report(ctx, order.id)).toBe(204);
  expect((await decide(ctx, order.id)).status).toBe(204);
  expect(await closeOrder(ctx, order.id)).toBe(204);
  await ctx.drain();
  return order;
}

/** Le retrait au comptoir, par la saisie du numéro de la commande. */
async function handOverAtCounter(reference: string): Promise<void> {
  await ctx.asSub(STAFF).post(`/admin/handover/manual/${reference}`).send({}).expect(201);
  await ctx.drain();
}

/** Réglée (écriture brute datée, cf. en-tête), puis le rattrapage des points. */
async function paidAndSwept(orderId: string): Promise<void> {
  await ctx.prisma.order.update({ where: { id: orderId }, data: { paymentStatus: "paid" } });
  await ctx
    .http()
    .post("/admin/loyalty/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
}

async function pointsOf(orderId: string): Promise<number[]> {
  const rows = await ctx.prisma.loyaltyLedgerEntry.findMany({
    where: { kind: "earned", orderId },
    select: { points: true },
  });
  return rows.map((row) => row.points);
}

function orderRow(orderId: string) {
  return ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
}

async function fulfilledFacts(orderId: string): Promise<number> {
  return ctx.prisma.outboxMessage.count({ where: { key: `order.fulfilled:${orderId}` } });
}

async function invoicingOf(orderId: string) {
  const { from, to } = windowAroundServiceDay();
  const orders = await ctx.app
    .get(MonthlyInvoicingReader, { strict: false })
    .uninvoicedOrders(from, to);
  return orders.find((one) => one.orderId === orderId);
}

describe("le solde au retrait", () => {
  it("un seul envoi, reste abandonné : soldée au rang 1 sur son BL, comme avant", async () => {
    const order = await decidedOrder();

    await handOverAtCounter(order.orderNumber);
    const invoiced = await invoicingOf(order.id);
    await paidAndSwept(order.id);

    const [note] = await ctx.prisma.deliveryNote.findMany({ where: { orderId: order.id } });
    const row = await orderRow(order.id);
    expect(row.status).toBe("fulfilled");
    expect(row.billableTotalCents).toBe(note?.totalCents);
    expect(await fulfilledFacts(order.id)).toBe(1);
    expect(invoiced?.frozen.totalCents).toBe(note?.totalCents);
    expect(await pointsOf(order.id)).toEqual([
      (row.billableSubtotalCents ?? 0) - (row.billableDiscountCents ?? 0),
    ]);
  });

  it("un seul envoi complet : la recopie des totaux de la commande, comme avant", async () => {
    const order = await accountOrder(ctx, 3);
    expect(await closeOrder(ctx, order.id)).toBe(204);
    await ctx.drain();

    await handOverAtCounter(order.orderNumber);
    const invoiced = await invoicingOf(order.id);
    await paidAndSwept(order.id);

    const row = await orderRow(order.id);
    expect(row.status).toBe("fulfilled");
    expect(row.billableTotalCents).toBe(row.totalCents);
    expect(invoiced?.frozen.totalCents).toBe(row.totalCents);
    expect(await pointsOf(order.id)).toEqual([row.subtotalCents - row.discountCents]);
  });
});
