/**
 * E2E du **retrait d'une commande** (`documentation/commandes/reliquat/reliquat.md`).
 *
 * Ce que seul le vrai Postgres prouve : par le geste commun du scan et de la
 * saisie, la commande retirée est soldée et son BL remis, sans message en
 * souffrance ; un second retrait est refusé en le nommant.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et Stripe.
 */
import type { AdminPlacedOrderResponse } from "@lfd/contracts";

import { CardProviders } from "../src/payment/card/domain/ports/card-providers.js";
import { HandoverAttestation } from "../src/handover/application/services/handover-attestation.service.js";
import { HandoverSubjectReader } from "../src/handover/channels/commerce/handover-subject.reader.js";
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
const BUYER = "auth0|acheteur-retrait-envoi";

const fakeGateway = cardGatewayDouble("pi_hbs");

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
    email: "acheteur-retrait-envoi@test.fr",
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

function notesOf(orderId: string) {
  return ctx.prisma.deliveryNote.findMany({
    where: { orderId },
    orderBy: { rank: "asc" },
    select: { id: true, rank: true, status: true, updatedAt: true },
  });
}

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
    select: {
      status: true,
      readyAt: true,
      handedOverAt: true,
      receivedOn: true,
      billableSubtotalCents: true,
      billableDiscountCents: true,
    },
  });
}

/** Le retrait d'un envoi, par le geste commun du scan et de la saisie, puis la boîte d'envoi. */
async function handOver(orderId: string, rank: number): Promise<void> {
  const subject = await ctx.app.get(HandoverSubjectReader).byOrderId(orderId);
  if (subject === null) {
    throw new TypeError(`commande ${orderId} introuvable côté commerce`);
  }
  await ctx.app.get(HandoverAttestation).attest(subject, [rank], E2E_STAFF_ID, "manual");
  await ctx.drain();
}

function attestationsOf(orderId: string) {
  return ctx.prisma.orderHandover.findMany({
    where: { orderId },
    orderBy: { rank: "asc" },
    select: { rank: true, reference: true },
  });
}

async function undelivered() {
  return ctx.prisma.outboxDelivery.findMany({
    where: { deliveredAt: null },
    select: { subscriber: true, lastError: true },
  });
}

/** Une commande au compte, colisée puis retirée au rang 1 par les vrais gestes. */
async function handedOverAtCounter(): Promise<string> {
  const account = await placeOnAccount(await scene());
  await closePlan();
  await packed(account, 1);
  await handOver(account, 1);
  return account;
}

describe("le retrait d'une commande", () => {
  it("avec un seul envoi : la commande soldée, son BL remis, comme avant", async () => {
    const account = await handedOverAtCounter();

    expect(await attestationsOf(account)).toEqual([
      { rank: 1, reference: await numberOf(account) },
    ]);
    expect((await orderStateOf(account)).status).toBe("fulfilled");
    expect((await notesOf(account)).map(({ rank, status }) => ({ rank, status }))).toEqual([
      { rank: 1, status: "handed_over" },
    ]);
    expect(await undelivered()).toEqual([]);
  });

  it("un second retrait est refusé en le nommant, sans message en souffrance", async () => {
    const account = await handedOverAtCounter();

    await expect(handOver(account, 1)).rejects.toThrow("Cette commande a déjà été retirée.");
    expect(await attestationsOf(account)).toHaveLength(1);
    await ctx.drain();
    expect(await undelivered()).toEqual([]);
    expect((await notesOf(account)).map(({ status }) => status)).toEqual(["handed_over"]);
  });
});
