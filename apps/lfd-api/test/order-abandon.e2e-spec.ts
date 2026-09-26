/**
 * E2E de **l'abandon du règlement** (plan
 * `documentation/order/plan-abandon-du-reglement.md`, lots 4 et 5) : le client
 * quitte l'écran de carte, et `POST /orders/:id/abandon` annule l'intention
 * chez Stripe PUIS écrit la base — pour un particulier. Un pro garde son
 * intention vivante jusqu'à la clôture (Q8).
 *
 * Stripe est la seule frontière doublée (avec la signature Auth0 du harnais) :
 * son issue d'annulation est écrite d'avance, test par test. Tout le reste —
 * le mur, le `where` conditionné, le bus, les abonnés du courriel, de la
 * cloche et du journal — tourne sur le vrai Postgres.
 *
 * Les commandes sont semées par Prisma, faute d'agrégat qui sache écrire une
 * commande à un état donné (même dette que `test/factories.ts` et
 * `order-payment-retry.e2e-spec.ts`).
 */
import { CommandBus } from "@nestjs/cqrs";

import { ConfirmOrderPaymentCommand } from "../src/b2b/orders/application/commands/confirm-order-payment.command.js";
import {
  PaymentGateway,
  type IntentCancellation,
} from "../src/b2b/payments/domain/payment-gateway.js";
import {
  CustomerRole,
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

/** L'issue que Stripe rendra à la prochaine annulation — remise à « annulée » avant chaque test. */
let cancellation: IntentCancellation = { kind: "cancelled" };
const cancelledIntents: string[] = [];
const fakeGateway = {
  createIntent: () => Promise.reject(new Error("non utilisé")),
  retrieveIntent: () => Promise.reject(new Error("non utilisé")),
  cancelIntent: (id: string) => {
    cancelledIntents.push(id);
    return Promise.resolve(cancellation);
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

interface SentMail {
  readonly to: string;
  readonly template: string;
}
const sentMails: SentMail[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: SentMail): Promise<{ providerId: null }> => {
    sentMails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: PaymentGateway, value: fakeGateway },
      { token: MAILER, value: recordingMailer },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  cancellation = { kind: "cancelled" };
  cancelledIntents.splice(0);
  sentMails.splice(0);
});

const AUTHOR = "auth0|abandon-auteur";
const COLLEAGUE = "auth0|abandon-collegue";

interface Seeded {
  readonly orderId: string;
  readonly intent: string;
}

let seq = 0;

/** Une commande passée, carte en attente, pour un particulier ou pour une société. */
async function seedOrder(clientele: OrderClientele): Promise<Seeded> {
  seq += 1;
  const author = await createUser(ctx.prisma, { auth0Sub: AUTHOR, firstName: "Léa" });
  let companyId: string | null = null;
  if (clientele === OrderClientele.pro) {
    const company = await createCompany(ctx.prisma, { enseigne: "Hôtel des Cimes" });
    companyId = company.id;
    await attachTo(ctx.prisma, author.id, company.id);
    const colleague = await createUser(ctx.prisma, { auth0Sub: COLLEAGUE });
    await attachTo(ctx.prisma, colleague.id, company.id, CustomerRole.owner);
  }
  const intent = `pi_abandon_${seq}`;
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-ABANDON-${seq}`,
      placedByUserId: author.id,
      companyId,
      clientele,
      status: OrderStatus.placed,
      subtotalCents: 2_000,
      totalCents: 2_110,
      vatCents: 110,
      paymentStatus: PaymentStatus.pending,
      stripePaymentIntentId: intent,
    },
    select: { id: true },
  });
  return { orderId: order.id, intent };
}

async function stateOf(orderId: string) {
  return ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, paymentStatus: true, paidAt: true },
  });
}

async function abandon(orderId: string, sub = AUTHOR) {
  const response = await ctx.asSub(sub).post(`/orders/${orderId}/abandon`);
  await ctx.drain();
  return response;
}

const bells = () => ctx.prisma.staffNotification.count({ where: { kind: "order.payment_failed" } });

describe("POST /orders/:id/abandon — ce que la base retient", () => {
  it("une commande publique est annulée, son règlement mort, et l'intention annulée chez Stripe", async () => {
    const { orderId, intent } = await seedOrder(OrderClientele.public);

    await abandon(orderId).then((response) => expect(response.status).toBe(204));

    expect(cancelledIntents).toEqual([intent]);
    expect(await stateOf(orderId)).toMatchObject({
      status: OrderStatus.cancelled,
      paymentStatus: PaymentStatus.failed,
    });
  });

  it("une commande pro reste passée : seul son règlement tombe (D4)", async () => {
    const { orderId } = await seedOrder(OrderClientele.pro);

    await abandon(orderId).then((response) => expect(response.status).toBe(204));

    expect(await stateOf(orderId)).toMatchObject({
      status: OrderStatus.placed,
      paymentStatus: PaymentStatus.failed,
    });
  });

  it("l'intention d'un pro reste vivante : Stripe n'est pas appelé (Q8)", async () => {
    const { orderId } = await seedOrder(OrderClientele.pro);
    // Même une panne Stripe ne refuse pas son abandon : on ne l'appelle pas.
    cancellation = { kind: "unavailable", reason: "ECONNRESET" };

    await abandon(orderId).then((response) => expect(response.status).toBe(204));

    expect(cancelledIntents).toEqual([]);
  });

  it("le second clic rend 204, sans rien réécrire ni resonner", async () => {
    const { orderId } = await seedOrder(OrderClientele.pro);
    await abandon(orderId);
    cancellation = { kind: "already_cancelled" };

    await abandon(orderId).then((response) => expect(response.status).toBe(204));

    expect(await bells()).toBe(1);
    expect(await ctx.prisma.activityEvent.count({ where: { type: "order.abandoned" } })).toBe(1);
  });

  it("le second clic d'un particulier rend 204 sans rappeler Stripe", async () => {
    const { orderId } = await seedOrder(OrderClientele.public);
    await abandon(orderId);

    await abandon(orderId).then((response) => expect(response.status).toBe(204));

    expect(cancelledIntents).toHaveLength(1);
  });
});

describe("POST /orders/:id/abandon — le mur (Q2)", () => {
  it("refuse un autre membre de la société : 403, et la commande ne bouge pas", async () => {
    const { orderId } = await seedOrder(OrderClientele.pro);

    const response = await abandon(orderId, COLLEAGUE);

    expect(response.status).toBe(403);
    expect(jsonBody<{ readonly code: string }>(response).code).toBe("orders.abandon.not_author");
    expect(cancelledIntents).toEqual([]);
    expect(await stateOf(orderId)).toMatchObject({ paymentStatus: PaymentStatus.pending });
  });

  it("un étranger ne voit même pas la commande : 404", async () => {
    const { orderId } = await seedOrder(OrderClientele.public);
    await createUser(ctx.prisma, { auth0Sub: "auth0|abandon-etranger" });

    const response = await abandon(orderId, "auth0|abandon-etranger");

    expect(response.status).toBe(404);
    expect(cancelledIntents).toEqual([]);
  });
});

describe("POST /orders/:id/abandon — Stripe n'a pas confirmé la mort de l'intention (§5)", () => {
  it.each<[IntentCancellation, string]>([
    [{ kind: "already_paid" }, "orders.abandon.already_paid"],
    [{ kind: "in_progress" }, "orders.abandon.payment_in_progress"],
    [{ kind: "unavailable", reason: "ECONNRESET" }, "orders.abandon.provider_unavailable"],
  ])("%o → 409 nommé, rien n'est écrit", async (outcome, code) => {
    const { orderId } = await seedOrder(OrderClientele.public);
    cancellation = outcome;

    const response = await abandon(orderId);

    expect(response.status).toBe(409);
    expect(jsonBody<{ readonly code: string }>(response).code).toBe(code);
    expect(await stateOf(orderId)).toMatchObject({
      status: OrderStatus.placed,
      paymentStatus: PaymentStatus.pending,
    });
    expect(await bells()).toBe(0);
  });
});

describe("un encaissement tardif sur une commande abandonnée (6 bis minimal)", () => {
  /**
   * Régression évitée : `PAID_FROM` accepte `failed`, et une commande abandonnée
   * vaut `cancelled` + `failed`. Sans la condition sur le statut, le webhook
   * tardif la repassait `paid` — une annulée encaissée que personne ne produit.
   */
  it("la laisse annulée, sans la marquer payée", async () => {
    const { orderId, intent } = await seedOrder(OrderClientele.public);
    await abandon(orderId);

    await ctx.app.get(CommandBus).execute(new ConfirmOrderPaymentCommand(intent, "succeeded"));
    await ctx.drain();

    expect(await stateOf(orderId)).toEqual({
      status: OrderStatus.cancelled,
      paymentStatus: PaymentStatus.failed,
      paidAt: null,
    });
  });
});

describe("ce que l'abandon fait dire (lot 5)", () => {
  it("un particulier : aucun courriel, aucune cloche, un fait au journal", async () => {
    const { orderId } = await seedOrder(OrderClientele.public);

    await abandon(orderId);

    expect(sentMails).toEqual([]);
    expect(await bells()).toBe(0);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "order.abandoned" },
      select: { payload: true },
    });
    expect(facts.map((fact) => fact.payload)).toEqual([
      expect.objectContaining({ orderId, outcome: "cancelled" }),
    ]);
  });

  it("un pro : aucun courriel, mais la cloche sonne (Q3)", async () => {
    const { orderId } = await seedOrder(OrderClientele.pro);

    await abandon(orderId);

    expect(sentMails).toEqual([]);
    const notices = await ctx.prisma.staffNotification.findMany({
      where: { kind: "order.payment_failed" },
      select: { subject: true, link: true },
    });
    expect(notices).toEqual([
      { subject: "Règlement tombé — Hôtel des Cimes", link: `/commandes/${orderId}` },
    ]);
  });

  it("une carte pro refusée par la banque sonne aussi, et le client reçoit le refus", async () => {
    const { intent } = await seedOrder(OrderClientele.pro);

    await ctx.app.get(CommandBus).execute(new ConfirmOrderPaymentCommand(intent, "failed"));
    await ctx.drain();

    expect(sentMails.map((mail) => mail.template)).toEqual(["customer.payment-failed"]);
    expect(await bells()).toBe(1);
  });
});
