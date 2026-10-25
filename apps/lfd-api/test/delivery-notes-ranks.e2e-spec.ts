/**
 * E2E de l'**alignement par rang** (plan E7, lot L2 —
 * `documentation/commandes/plan-e7-reliquat-bati.md`, choix 3).
 *
 * Ce que seul le vrai Postgres prouve : qu'un BL-1 remis par les vrais gestes
 * et un reliquat prévu par `planRemainder` cohabitent sans que le
 * réconciliateur crie `several_live_notes`, ni ne touche au reliquat ; et
 * qu'avec un seul envoi, le passage rend ce qu'il rendait.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et Stripe.
 */
import type { AdminPlacedOrderResponse } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";

import type { DeliveryNoteReconciliationReport } from "../src/b2b/delivery-notes/application/commands/reconcile-delivery-notes.command.js";
import { DeliveryNote } from "../src/b2b/delivery-notes/domain/entities/delivery-note.js";
import { DeliveryNoteRepository } from "../src/b2b/delivery-notes/domain/ports/delivery-note.repository.js";
import { ORDER_TERMS } from "../src/b2b/delivery-notes/domain/value-objects/__tests__/delivery-note-terms.fixture.js";
import { MarkOrderFulfilledCommand } from "../src/b2b/orders/application/commands/mark-order-fulfilled.command.js";
import { MarkOrderReadyCommand } from "../src/b2b/orders/application/commands/mark-order-ready.command.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
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
const NEXT_DAY = serviceDay(8);
const BUYER = "auth0|acheteur-bl-rangs";

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    const id = `pi_blr_${String(intentCounter)}`;
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
    email: "acheteur-bl-rangs@test.fr",
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
    select: { id: true, rank: true, status: true, updatedAt: true, serviceDay: true },
  });
}

async function reconcile(): Promise<DeliveryNoteReconciliationReport> {
  const response = await staff().post("/admin/delivery-notes/reconcile").expect(200);
  return jsonBody<DeliveryNoteReconciliationReport>(response);
}

/** Une commande au compte remise par les vrais gestes : son BL-1 est `handed_over`. */
async function handedOverOnAccount(): Promise<string> {
  const account = await placeOnAccount(await scene());
  await closePlan();
  const readyAt = await markReady(account);
  await markFulfilled(account, new Date(readyAt.getTime() + 60_000));
  return account;
}

/** Le reliquat, par la fabrique du domaine (lot L1) — jamais un INSERT brut. */
async function planRemainder(orderId: string): Promise<void> {
  const saved = await ctx.app.get(DeliveryNoteRepository).saveNew(
    DeliveryNote.planRemainder(
      `dn_rest_${orderId}`,
      {
        orderId,
        orderNumber: await numberOf(orderId),
        orderDay: DAY,
        terms: ORDER_TERMS,
        lines: [
          {
            sku: "VIE-001",
            productName: "Croissant",
            unitPriceMillicents: 95_000,
            vatRate: 5.5,
            quantity: 2,
            lineTotalCents: 1_900,
            unitPriceTtcCents: null,
            lineTotalTtcCents: null,
            pickupDiscountEligible: true,
          },
        ],
      },
      2,
      NEXT_DAY,
      new Date(),
    ),
  );
  expect(saved).toBe(true);
}

describe("le réconciliateur aligne par rang (plan E7, choix 3)", () => {
  it("avec un seul envoi : rien ne change — aligné, compté, non réécrit", async () => {
    const account = await handedOverOnAccount();
    const before = await notesOf(account);

    const report = await reconcile();

    expect(report).toMatchObject({ created: 0, advanced: 0, voided: 0, unrepaired: [] });
    expect(report.terms).toEqual({ compared: 1, gaps: [] });
    expect(await notesOf(account)).toEqual(before);
  });

  it("BL-1 remis + reliquat vivant : aligné, pas `several_live_notes`, le reliquat intact", async () => {
    const account = await handedOverOnAccount();
    await planRemainder(account);
    const before = await notesOf(account);

    const report = await reconcile();

    expect(report).toMatchObject({ created: 0, advanced: 0, voided: 0, failed: 0, unrepaired: [] });
    expect(report.terms).toEqual({ compared: 1, gaps: [] });
    expect(await notesOf(account)).toEqual(before);
    expect(before.map(({ rank, status }) => ({ rank, status }))).toEqual([
      { rank: 1, status: "handed_over" },
      { rank: 2, status: "planned" },
    ]);
  });
});
