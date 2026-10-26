/**
 * E2E du **comptoir par envoi** (plan E7 reliquat, lot L4c —
 * `documentation/commandes/plan-e7-reliquat-bati.md`, choix 13).
 *
 * Ce que seul le vrai Postgres prouve : que le jeton de la commande rend ses
 * envois prêts (la commande et son reste colisé), que « Remettre » les remet
 * d'un geste — une attestation par envoi, dans une transaction —, qu'un reste
 * se saisit par son numéro `ORD-…-2`, qu'un seul envoi garde l'écran et les
 * routes d'avant, et que l'annulation refuse dès qu'UN envoi est retiré.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et Stripe.
 */
import type { AdminPlacedOrderResponse, OrderHandoverView } from "@lfd/contracts";

import { DeliveryNote } from "../src/b2b/delivery-notes/domain/entities/delivery-note.js";
import { DeliveryNoteRepository } from "../src/b2b/delivery-notes/domain/ports/delivery-note.repository.js";
import { ORDER_TERMS } from "../src/b2b/delivery-notes/domain/value-objects/__tests__/delivery-note-terms.fixture.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { DurablePublisher } from "../src/platform/outbox/durable-publisher.js";
import { PackingOrderPackedEvent } from "../src/production/channels/commerce/index.js";
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
const BUYER = "auth0|acheteur-comptoir-envois";

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    const id = `pi_hsc_${String(intentCounter)}`;
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
    email: "acheteur-comptoir-envois@test.fr",
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

function notesOf(orderId: string) {
  return ctx.prisma.deliveryNote.findMany({
    where: { orderId },
    orderBy: { rank: "asc" },
    select: { id: true, rank: true, status: true, updatedAt: true, serviceDay: true },
  });
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

function attestationsOf(orderId: string) {
  return ctx.prisma.orderHandover.findMany({
    where: { orderId },
    orderBy: { rank: "asc" },
    select: { rank: true, reference: true },
  });
}

async function tokenOf(orderId: string): Promise<string> {
  const { handoverToken } = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { handoverToken: true },
  });
  if (handoverToken === null) {
    throw new TypeError(`commande ${orderId} sans jeton de retrait`);
  }
  return handoverToken;
}

/** Une commande au compte, colisée, et son reste colisé le même jour. */
async function twoReadyShipments(): Promise<string> {
  const account = await placeOnAccount(await scene());
  await closePlan();
  await packed(account, 1);
  await planRemainder(account);
  await packed(account, 2);
  return account;
}

describe("le comptoir par envoi (plan E7 reliquat, lot L4c)", () => {
  it("un seul envoi : le scan rend la commande au rang 1, et `{}` la remet comme avant", async () => {
    const account = await placeOnAccount(await scene());
    await closePlan();
    await packed(account, 1);
    const token = await tokenOf(account);
    const number = await numberOf(account);

    const seen = jsonBody<OrderHandoverView>(
      await staff().get(`/admin/handover/${token}`).expect(200),
    );
    expect(seen).toMatchObject({ rank: 1, reference: number, blockedReason: null });
    expect(seen.shipments.map(({ rank }) => rank)).toEqual([1]);

    const done = jsonBody<OrderHandoverView>(
      await staff().post(`/admin/handover/${token}`).send({}).expect(201),
    );
    expect(done).toMatchObject({ rank: 1, handedOverVia: "scan", shipments: [] });
    expect(await attestationsOf(account)).toEqual([{ rank: 1, reference: number }]);
  });

  it("deux envois prêts : le scan les rend, « Remettre » les remet d'un geste, une attestation chacun", async () => {
    const account = await twoReadyShipments();
    const token = await tokenOf(account);
    const number = await numberOf(account);

    const seen = jsonBody<OrderHandoverView>(
      await staff().get(`/admin/handover/${token}`).expect(200),
    );
    expect(seen.shipments.map(({ rank, reference }) => ({ rank, reference }))).toEqual([
      { rank: 1, reference: number },
      { rank: 2, reference: `${number}-2` },
    ]);

    const done = jsonBody<OrderHandoverView>(
      await staff()
        .post(`/admin/handover/${token}`)
        .send({ ranks: [1, 2] })
        .expect(201),
    );
    await ctx.drain();
    expect(done.shipments).toEqual([]);
    expect(await attestationsOf(account)).toEqual([
      { rank: 1, reference: number },
      { rank: 2, reference: `${number}-2` },
    ]);
    expect((await notesOf(account)).map(({ rank, status }) => ({ rank, status }))).toEqual([
      { rank: 1, status: "handed_over" },
      { rank: 2, status: "handed_over" },
    ]);
    // L5b : quel que soit l'ordre des deux abonnés, la commande est soldée.
    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: account } });
    expect(order.status).toBe("fulfilled");
    expect(order.billableTotalCents).not.toBeNull();
  });

  it("la file ouvre la même liste : la ligne de la commande rend ses deux envois", async () => {
    const account = await twoReadyShipments();

    const seen = jsonBody<OrderHandoverView>(
      await staff().get(`/admin/handover/order/${account}`).expect(200),
    );

    expect(seen.shipments.map(({ rank }) => rank)).toEqual([1, 2]);
  });

  it("un rang refusé annule tout le geste : rien n'est retiré", async () => {
    const account = await placeOnAccount(await scene());
    await closePlan();
    await packed(account, 1);
    await planRemainder(account);
    const token = await tokenOf(account);

    // Le reste est prévu, pas colisé : on ne tend pas un sac qui n'existe pas.
    await staff()
      .post(`/admin/handover/${token}`)
      .send({ ranks: [1, 2] })
      .expect(409);

    expect(await attestationsOf(account)).toEqual([]);
  });

  it("la saisie d'un numéro de reste `ORD-…-2` remet ce reste, et lui seul", async () => {
    const account = await twoReadyShipments();
    const number = await numberOf(account);

    const done = jsonBody<OrderHandoverView>(
      await staff().post(`/admin/handover/manual/${number}-2`).send({}).expect(201),
    );

    expect(done).toMatchObject({ rank: 2, reference: `${number}-2`, handedOverVia: "manual" });
    expect(done.shipments.map(({ rank }) => rank)).toEqual([1]);
    expect(await attestationsOf(account)).toEqual([{ rank: 2, reference: `${number}-2` }]);
  });

  it("un corps hors forme est refusé avant tout geste", async () => {
    const account = await twoReadyShipments();

    await staff()
      .post(`/admin/handover/${await tokenOf(account)}`)
      .send({ ranks: [2, 2] })
      .expect(400);
    expect(await attestationsOf(account)).toEqual([]);
  });

  /**
   * Régression (§3 bis, laissée par L4b) : l'annulation ne lisait que
   * l'attestation du rang 1 — un reste retiré avant elle laissait annuler la
   * commande sous un sac déjà parti.
   */
  it("🔴 un reste retiré avant la commande interdit d'annuler la commande", async () => {
    const account = await placeOnAccount(await scene());
    await planRemainder(account);
    await packed(account, 2);
    const number = await numberOf(account);
    await staff().post(`/admin/handover/manual/${number}-2`).send({}).expect(201);
    await ctx.drain();

    const refused = await staff()
      .post(`/admin/orders/${account}/cancel`)
      .send({ reason: "Le client a renoncé." })
      .expect(409);
    // L5a : le refus nomme le reste, pas la commande entière.
    expect(refused.body).toMatchObject({ code: "orders.cancel.remainder_handed_over" });

    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: account } })).status).not.toBe(
      "cancelled",
    );
  });

  /**
   * Plan E7 reliquat (L5a) : l'alignement laisse un reste à son envoi ; une
   * commande annulée n'a plus rien à livrer, ses restes s'annulent avec elle.
   */
  it("annuler une commande annule aussi son reste prévu", async () => {
    const account = await placeOnAccount(await scene());
    await planRemainder(account);

    await staff()
      .post(`/admin/orders/${account}/cancel`)
      .send({ reason: "Le client a renoncé." })
      .expect(204);

    expect((await notesOf(account)).map((note) => [note.rank, note.status])).toEqual([
      [2, "voided"],
    ]);
  });
});
