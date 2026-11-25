/**
 * E2E du **BL de rang 1**, le seul qu'une commande porte : le reste d'un
 * départ incomplet devient une nouvelle commande
 * (`documentation/commandes/reliquat/reliquat.md`).
 *
 * Ce que seul le vrai Postgres prouve : qu'un BL remis par les vrais gestes
 * reste aligné, qu'un bac fermé rend la commande prête et son BL préparé, et
 * qu'un fait de rang > 1 encore en vol est livré aux abonnés muets du second
 * envoi sans finir en lettre morte.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et Stripe.
 */
import type { AdminPlacedOrderResponse } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";

import type { DeliveryNoteReconciliationReport } from "../src/lafoliecoffee/delivery-notes/application/commands/reconcile-delivery-notes.command.js";
import { MarkOrderFulfilledCommand } from "../src/lafoliecoffee/orders/application/commands/mark-order-fulfilled.command.js";
import { MarkOrderReadyCommand } from "../src/lafoliecoffee/orders/application/commands/mark-order-ready.command.js";
import { CardProviders } from "../src/payment/card/domain/ports/card-providers.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { DurablePublisher } from "../src/platform/outbox/durable-publisher.js";
import { PackingOrderPackedEvent } from "../src/packing/channels/commerce/index.js";
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
import { cardGatewayDouble } from "./order-factory.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";

const DAY = serviceDay(7);
const BUYER = "auth0|acheteur-bl-rangs";

const fakeGateway = cardGatewayDouble("pi_blr");

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
      { token: CardProviders, value: fakeGateway },
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
    lines: [{ sku: "VIE-001-1", quantity }],
  };
}

/** Une commande au compte, saisie par l'équipe. */
async function placeOnAccount(where: Scene, quantity = 10): Promise<string> {
  const response = await staff()
    .post("/admin/orders")
    .set(INTENT_KEY, freshIntent())
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
    select: { id: true, rank: true, status: true, updatedAt: true },
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

describe("le réconciliateur et le BL de la commande", () => {
  it("avec un seul envoi : rien ne change — aligné, compté, non réécrit", async () => {
    const account = await handedOverOnAccount();
    const before = await notesOf(account);

    const report = await reconcile();

    expect(report).toMatchObject({ created: 0, advanced: 0, voided: 0, unrepaired: [] });
    expect(report.terms).toEqual({ compared: 1, gaps: [] });
    expect(await notesOf(account)).toEqual(before);
  });
});

/** Le bac fermé au colisage, publié comme le colisage le publie : dans une unité de travail. */
async function packed(orderId: string, rank: number): Promise<void> {
  const fact = new PackingOrderPackedEvent(
    orderId,
    rank,
    await numberOf(orderId),
    new Date(),
    E2E_STAFF_ID,
  );
  await ctx.app
    .get(UnitOfWork)
    .run(() => ctx.app.get(DurablePublisher).publish(fact.durableFact()));
  await ctx.drain();
}

function orderStateOf(orderId: string) {
  return ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, readyAt: true, handedOverAt: true },
  });
}

describe("prêt au bac fermé", () => {
  it("avec un seul envoi : le bac fermé rend la commande prête et son BL préparé, comme avant", async () => {
    const account = await placeOnAccount(await scene());
    await closePlan();

    await packed(account, 1);

    expect((await orderStateOf(account)).status).toBe("ready");
    expect((await notesOf(account)).map(({ rank, status }) => ({ rank, status }))).toEqual([
      { rank: 1, status: "prepared" },
    ]);
  });

  it("un fait de rang 2 en vol : ni la commande ni son BL ne bougent, aucune lettre morte", async () => {
    const account = await handedOverOnAccount();
    const orderBefore = await orderStateOf(account);
    const notesBefore = await notesOf(account);

    await packed(account, 2);

    expect(await orderStateOf(account)).toEqual(orderBefore);
    expect(await notesOf(account)).toEqual(notesBefore);
    const receipts = await ctx.prisma.outboxDelivery.findMany({
      where: { deliveredAt: null },
      select: { subscriber: true, lastError: true },
    });
    expect(receipts).toEqual([]);
  });
});

/** Les clés des faits `order.ready` d'une commande, et le nombre de courriels « prête » partis. */
async function readinessOf(orderId: string) {
  await ctx.drain();
  const facts = await ctx.prisma.outboxMessage.findMany({
    where: { type: "order.ready", key: { startsWith: `order.ready:${orderId}` } },
    orderBy: { key: "asc" },
    select: { key: true },
  });
  const mails = await ctx.prisma.mailRequest.count({
    where: { template: "customer.order-ready", status: "sent" },
  });
  return { keys: facts.map(({ key }) => key), mails };
}

describe("la commande prête prévient le client", () => {
  it("avec un seul envoi : un fait, sa clé d'avant, un courriel", async () => {
    const account = await placeOnAccount(await scene());
    await closePlan();

    await packed(account, 1);

    expect(await readinessOf(account)).toEqual({ keys: [`order.ready:${account}`], mails: 1 });
  });
});
