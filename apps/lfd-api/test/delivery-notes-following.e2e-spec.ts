/**
 * E2E du **bon de livraison qui suit la commande** (plan
 * plan E2 (`documentation/commandes/bon-de-livraison.md`), § 8.5).
 *
 * Ce que seul le vrai Postgres prouve : que le BL avance dans la transaction
 * du geste (bac fermé, remise), que les CHECK d'état de `20261024210000`
 * acceptent ce que l'agrégat écrit, et que le réconciliateur rattrape une
 * commande avancée « par l'ancien code » (écriture directe en base).
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et Stripe.
 */
import type { AdminPlacedOrderResponse } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";

import { MarkOrderFulfilledCommand } from "../src/b2b/orders/application/commands/mark-order-fulfilled.command.js";
import { MarkOrderReadyCommand } from "../src/b2b/orders/application/commands/mark-order-ready.command.js";
import type { DeliveryNoteReconciliationReport } from "../src/b2b/delivery-notes/application/commands/reconcile-delivery-notes.command.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
  OrderStatus,
} from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const DAY = serviceDay(7);
const BUYER = "auth0|acheteur-bl-suivi";

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    const id = `pi_bls_${String(intentCounter)}`;
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment",
    }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      {
        token: AdminTokenVerifier,
        value: {
          verify: (): Promise<{ subject: string; scopes: string[] }> =>
            Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
        },
      },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Un point de retrait et une société au compte. */
interface Scene {
  readonly companyId: string;
  readonly buyerUserId: string;
  readonly pickupId: string;
}

async function scene(): Promise<Scene> {
  const point = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, {
    auth0Sub: BUYER,
    email: "acheteur-bl-suivi@test.fr",
  });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  return { companyId: company.id, buyerUserId: user.id, pickupId: point.id };
}

function content(pickupId: string, quantity: number): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: "VIE-001", quantity }],
  };
}

/** Une commande au compte, saisie par l'équipe. */
async function placeOnAccount(where: Scene, quantity = 10): Promise<string> {
  const response = await staff()
    .post("/admin/orders")
    .send({
      companyId: where.companyId,
      buyerUserId: where.buyerUserId,
      settlement: "account",
      ...content(where.pickupId, quantity),
    })
    .expect(201);
  return jsonBody<AdminPlacedOrderResponse>(response).id;
}

async function closePlan(): Promise<void> {
  await staff().post(`/admin/production/batch/${DAY}/close`).expect(201);
  await ctx.drain();
}

async function numberOf(orderId: string): Promise<string> {
  const { orderNumber } = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { orderNumber: true },
  });
  return orderNumber;
}

/** Les instants sont relatifs à maintenant : le code du retrait les compare au jour. */
async function markReady(orderId: string, at = new Date()): Promise<Date> {
  await ctx.app
    .get(CommandBus)
    .execute(new MarkOrderReadyCommand(await numberOf(orderId), E2E_STAFF_ID, at));
  return at;
}

async function markFulfilled(orderId: string, at = new Date()): Promise<Date> {
  await ctx.app
    .get(CommandBus)
    .execute(new MarkOrderFulfilledCommand(await numberOf(orderId), E2E_STAFF_ID, at, "manual"));
  return at;
}

function notesOf(orderId: string) {
  return ctx.prisma.deliveryNote.findMany({
    where: { orderId },
    orderBy: { rank: "asc" },
    select: {
      id: true,
      status: true,
      plannedAt: true,
      preparedAt: true,
      handedOverAt: true,
      receivedOn: true,
      voidedAt: true,
      lines: { select: { quantity: true, lineTotalCents: true } },
    },
  });
}

async function receivedOnOf(orderId: string): Promise<Date | null> {
  const { receivedOn } = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { receivedOn: true },
  });
  return receivedOn;
}

async function reconcile(): Promise<DeliveryNoteReconciliationReport> {
  const response = await staff().post("/admin/delivery-notes/reconcile").expect(200);
  return jsonBody<DeliveryNoteReconciliationReport>(response);
}

describe("le BL suit la commande (plan E2, § 8.3)", () => {
  it("bac fermé sur une commande confirmée → `prepared`, à l'instant du bac", async () => {
    const account = await placeOnAccount(await scene());
    await closePlan();

    const at = await markReady(account);

    const [note] = await notesOf(account);
    expect(note).toMatchObject({ status: "prepared", preparedAt: at, handedOverAt: null });
  });

  it("prête hors plan (sans arrêt) → BL plein, né `prepared`", async () => {
    const account = await placeOnAccount(await scene(), 3);

    const at = await markReady(account);

    const notes = await notesOf(account);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ status: "prepared", plannedAt: at, preparedAt: at });
    expect(notes[0]?.lines.map((line) => line.quantity)).toEqual([3]);
  });

  it("remise après le bac → `handed_over`, avec le jour de réception de la commande", async () => {
    const account = await placeOnAccount(await scene());
    await closePlan();
    const readyAt = await markReady(account);

    const at = await markFulfilled(account, new Date(readyAt.getTime() + 60_000));

    const [note] = await notesOf(account);
    expect(note).toMatchObject({ status: "handed_over", preparedAt: readyAt, handedOverAt: at });
    expect(note?.receivedOn).toEqual(await receivedOnOf(account));
    expect(note?.receivedOn).not.toBeNull();
  });

  it("remise d'une commande confirmée sans bac → `handed_over`, préparé à l'instant de la remise", async () => {
    const account = await placeOnAccount(await scene());
    await closePlan();

    const at = await markFulfilled(account);

    const [note] = await notesOf(account);
    expect(note).toMatchObject({ status: "handed_over", preparedAt: at, handedOverAt: at });
  });

  it("un rescan du bac ne réécrit pas le BL", async () => {
    const account = await placeOnAccount(await scene());
    await closePlan();
    await markReady(account);
    const before = await notesOf(account);

    await markReady(account, new Date(Date.now() + 60_000));

    expect(await notesOf(account)).toEqual(before);
  });
});

describe("le réconciliateur rattrape ce que l'ancien code a laissé (plan E2, § 8.2)", () => {
  it("commande avancée en base sans BL, puis BL prévu en retard : rattrapées, et un second passage ne fait rien", async () => {
    const where = await scene();
    const late = await placeOnAccount(where);
    await closePlan();
    const offPlan = await placeOnAccount(where, 2);
    // « L'ancien code » : la commande avance sans toucher au BL.
    const readyAt = new Date();
    await ctx.prisma.order.update({
      where: { id: late },
      data: { status: OrderStatus.ready, readyAt, readyBy: E2E_STAFF_ID },
    });
    await ctx.prisma.order.update({
      where: { id: offPlan },
      data: { status: OrderStatus.ready, readyAt, readyBy: E2E_STAFF_ID },
    });

    const first = await reconcile();

    expect(first).toMatchObject({ created: 1, advanced: 1, failed: 0, complete: true });
    expect((await notesOf(late))[0]).toMatchObject({ status: "prepared", preparedAt: readyAt });
    expect((await notesOf(offPlan))[0]).toMatchObject({ status: "prepared", preparedAt: readyAt });
    const second = await reconcile();
    expect(second).toMatchObject({ created: 0, advanced: 0, voided: 0, failed: 0 });
  });

  it("BL vivant sur une commande annulée en base → annulé, préparé gardé", async () => {
    const account = await placeOnAccount(await scene());
    await closePlan();
    await markReady(account);
    await ctx.prisma.order.update({
      where: { id: account },
      data: { status: OrderStatus.cancelled },
    });

    await reconcile();

    const [note] = await notesOf(account);
    expect(note?.status).toBe("voided");
    expect(note?.preparedAt).not.toBeNull();
  });
});
