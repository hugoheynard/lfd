/**
 * E2E du **retrait par envoi** (plan E7 reliquat, lot L4b —
 * `documentation/commandes/plan-e7-reliquat-bati.md`).
 *
 * Ce que seul le vrai Postgres prouve : qu'un reliquat se remet sous sa
 * propre attestation (`(commande, rang)` unique, référence `-2`), que la
 * boîte d'envoi porte son fait jusqu'à SON bon de livraison sans toucher la
 * commande — ni statut, ni solde, ni facture, ni points avant L5 —, qu'un
 * double retrait du même envoi est refusé, et que la commande annulée
 * refuse aussi son reliquat. Avec un seul envoi, le retrait rend ce qu'il
 * rendait.
 *
 * Le rang n'a pas encore de route (le panneau par envoi est L4c) : le geste
 * passe par le service que le scan et la saisie appellent.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`) et Stripe.
 */
import type { AdminPlacedOrderResponse } from "@lfd/contracts";

import { DeliveryNote } from "../src/b2b/delivery-notes/domain/entities/delivery-note.js";
import { DeliveryNoteRepository } from "../src/b2b/delivery-notes/domain/ports/delivery-note.repository.js";
import { ORDER_TERMS } from "../src/b2b/delivery-notes/domain/value-objects/__tests__/delivery-note-terms.fixture.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { HandoverAttestation } from "../src/handover/application/services/handover-attestation.service.js";
import { HandoverSubjectReader } from "../src/handover/channels/commerce/handover-subject.reader.js";
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
const BUYER = "auth0|acheteur-retrait-envoi";

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    const id = `pi_hbs_${String(intentCounter)}`;
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
            saleUnit: "piece" as const,
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

function factTypes(): Promise<string[]> {
  return ctx.prisma.outboxMessage
    .findMany({ orderBy: { id: "asc" }, select: { type: true } })
    .then((rows) => rows.map((row) => row.type).sort());
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

describe("le retrait par envoi (plan E7 reliquat, lot L4b)", () => {
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

  it("le reliquat remis passe SON BL remis ; la commande, son solde et ses points ne bougent pas", async () => {
    const account = await handedOverAtCounter();
    await planRemainder(account);
    await packed(account, 2);
    const orderBefore = await orderStateOf(account);
    const factsBefore = await factTypes();
    const pointsBefore = await ctx.prisma.loyaltyLedgerEntry.count();

    await handOver(account, 2);

    const reference = await numberOf(account);
    expect(await attestationsOf(account)).toEqual([
      { rank: 1, reference },
      { rank: 2, reference: `${reference}-2` },
    ]);
    expect((await notesOf(account)).map(({ rank, status }) => ({ rank, status }))).toEqual([
      { rank: 1, status: "handed_over" },
      { rank: 2, status: "handed_over" },
    ]);
    // Avant L5 : ni statut, ni date, ni montants facturables, ni `order.fulfilled`
    // (donc ni points ni facture) — seul le fait du retrait est écrit.
    expect(await orderStateOf(account)).toEqual(orderBefore);
    expect(await factTypes()).toEqual([...factsBefore, "handover.handed_over"].sort());
    expect(await ctx.prisma.loyaltyLedgerEntry.count()).toBe(pointsBefore);
    expect(await undelivered()).toEqual([]);
  });

  it("un double retrait du même reliquat est refusé en le nommant ; le rang 1 l'est aussi", async () => {
    const account = await handedOverAtCounter();
    await planRemainder(account);
    await packed(account, 2);
    await handOver(account, 2);

    await expect(handOver(account, 2)).rejects.toThrow(
      "Le reste de cette commande (envoi 2) a déjà été retiré.",
    );
    await expect(handOver(account, 1)).rejects.toThrow("Cette commande a déjà été retirée.");
    expect(await attestationsOf(account)).toHaveLength(2);
    // Chaque refus réannonce l'attestation de SON envoi : rejouées, elles
    // sont sans effet de part et d'autre, sans message en souffrance.
    await ctx.drain();
    expect(await undelivered()).toEqual([]);
    expect((await notesOf(account)).map(({ status }) => status)).toEqual([
      "handed_over",
      "handed_over",
    ]);
  });

  it("une commande annulée refuse aussi son reliquat, sous le verrou commun", async () => {
    const account = await placeOnAccount(await scene());
    await planRemainder(account);
    await staff()
      .post(`/admin/orders/${account}/cancel`)
      .send({ reason: "Le client a renoncé." })
      .expect(204);

    await expect(handOver(account, 2)).rejects.toThrow("Cette commande est annulée.");
    expect(await attestationsOf(account)).toEqual([]);
  });
});
