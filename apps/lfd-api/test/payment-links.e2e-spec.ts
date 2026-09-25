import { randomUUID } from "node:crypto";
/**
 * E2E des **liens de paiement** (`/admin/accounting/payment-links`, plan
 * `documentation/comptabilite/plan-blocage-prelevement-et-liens-de-paiement.md` §2).
 *
 * Ce que seul le vrai SQL prouve :
 * - la lecture des commandes à régler filtre `pending | failed` hors annulées ;
 * - le renvoi part par le gabarit neuf, et refuse sans `CLIENT_BASE_URL` ;
 * - un lien libre traverse la table, ses contraintes, le plafond lu en base et
 *   le journal ; le webhook le rapproche par sa session, rejoué sans dommage,
 *   et sonne la cloche quand un lien annulé est payé.
 *
 * Frontières doublées : la signature du jeton staff, la passerelle Stripe (les
 * deux ports), le mailer et l'origine de l'espace client.
 */
import type {
  AccountingSettingsView,
  CreatedPaymentLink,
  OrderAwaitingPaymentView,
  PaymentLinkView,
} from "@lfd/contracts";

import { CheckoutGateway } from "../src/b2b/payments/domain/ports/checkout-gateway.js";
import {
  PaymentGateway,
  type PaymentWebhookEvent,
} from "../src/b2b/payments/domain/payment-gateway.js";
import { OrderMailOrigins } from "../src/b2b/orders/domain/ports/order-mail-origins.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const BUYER = "auth0|acheteur-carte";
const LINKS = "/admin/accounting/payment-links";
const ORDERS = `${LINKS}/orders`;
const SETTINGS = "/admin/accounting/settings";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let intentCounter = 0;
/** Le prochain événement que « Stripe » livrera au webhook. */
let nextWebhook: PaymentWebhookEvent = { kind: "ignored" };
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_link_${String(intentCounter)}`,
      clientSecret: `pi_link_${String(intentCounter)}_secret`,
    });
  },
  retrieveIntent: (id: string) => Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_s` }),
  publishableKey: () => "pk_e2e",
  parseWebhook: (): PaymentWebhookEvent => nextWebhook,
};

let sessionCounter = 0;
const expiredSessions: string[] = [];
const fakeCheckout = {
  createCheckoutSession: () => {
    sessionCounter += 1;
    const sessionId = `cs_e2e_${String(sessionCounter)}`;
    return Promise.resolve({ sessionId, url: `https://checkout.stripe.test/${sessionId}` });
  },
  expireCheckoutSession: (sessionId: string) => {
    expiredSessions.push(sessionId);
    return Promise.resolve();
  },
};

interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly data: unknown;
}
const sentMails: SentMail[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: SentMail): Promise<{ providerId: null }> => {
    sentMails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

let clientBaseUrl: string | null = "https://app.lfc.test";
const origins = {
  clientBaseUrl: () => clientBaseUrl,
  adminBaseUrl: () => null,
};

let ctx: E2eContext;
let pickupId = "pickup_absent";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
      { token: CheckoutGateway, value: fakeCheckout },
      { token: MAILER, value: recordingMailer },
      { token: OrderMailOrigins, value: origins },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  sentMails.splice(0);
  expiredSessions.splice(0);
  clientBaseUrl = "https://app.lfc.test";
  nextWebhook = { kind: "ignored" };
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub(E2E_STAFF_SUB);
}

/** Une société active SANS crédit — ses commandes se règlent par carte. */
async function seedCompany(): Promise<{ companyId: string }> {
  const point = await ctx.prisma.pickupAddress.create({
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
  pickupId = point.id;
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER, email: "acheteur@carte.fr" });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  return { companyId: company.id };
}

/** Une commande passée par le client : sans crédit, elle attend sa carte. */
async function placeCardOrder(companyId: string): Promise<string> {
  const response = await ctx
    .asSub(BUYER)
    .post("/orders")
    .send({
      companyId,
      idempotencyKey: randomUUID(),
      pickupAddressId: pickupId,
      fulfillmentMethod: "pickup",
      requestedDeliveryDate: serviceDay(),
      note: "",
      lines: [{ sku: "VIE-001", quantity: 3 }],
    })
    .expect(201);
  await ctx.drain();
  return jsonBody<{ id: string }>(response).id;
}

async function webhook(event: PaymentWebhookEvent): Promise<void> {
  nextWebhook = event;
  await ctx
    .http()
    .post("/payments/webhook")
    .set("stripe-signature", "t=1,v1=signé-par-le-doublé")
    .set("content-type", "application/json")
    .send("{}")
    .expect(200);
}

describe("2a — les commandes à régler par carte", () => {
  it("liste une commande en attente avec son lien, et écarte payée et annulée", async () => {
    const { companyId } = await seedCompany();
    const pending = await placeCardOrder(companyId);
    const paid = await placeCardOrder(companyId);
    const cancelled = await placeCardOrder(companyId);
    await ctx.prisma.order.update({ where: { id: paid }, data: { paymentStatus: "paid" } });
    await ctx.prisma.order.update({ where: { id: cancelled }, data: { status: "cancelled" } });

    const rows = jsonBody<OrderAwaitingPaymentView[]>(await staff().get(ORDERS).expect(200));

    expect(rows.map((row) => row.orderId)).toEqual([pending]);
    expect(rows[0]).toMatchObject({
      companyId,
      paymentStatus: "pending",
      paymentUrl: `https://app.lfc.test/commandes/${pending}/regler`,
    });
  });

  it("renvoie le lien à l'acheteur par le gabarit neuf", async () => {
    const { companyId } = await seedCompany();
    const orderId = await placeCardOrder(companyId);
    sentMails.splice(0);

    await staff().post(`${ORDERS}/${orderId}/resend`).expect(204);

    const mails = sentMails.filter((mail) => mail.template === "customer.order-payment-link");
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({
      to: "acheteur@carte.fr",
      data: { settleUrl: `https://app.lfc.test/commandes/${orderId}/regler` },
    });
  });

  it("sans CLIENT_BASE_URL : pas de lien à l'écran, et un renvoi refusé qui le dit", async () => {
    const { companyId } = await seedCompany();
    const orderId = await placeCardOrder(companyId);
    clientBaseUrl = null;

    const rows = jsonBody<OrderAwaitingPaymentView[]>(await staff().get(ORDERS).expect(200));
    expect(rows[0]?.paymentUrl).toBeNull();

    const refused = await staff().post(`${ORDERS}/${orderId}/resend`).expect(409);
    expect(refused.body).toMatchObject({ code: "orders.payment_link.refused" });
    expect(JSON.stringify(refused.body)).toContain("CLIENT_BASE_URL");
  });

  it("refuse le renvoi d'une commande déjà payée", async () => {
    const { companyId } = await seedCompany();
    const orderId = await placeCardOrder(companyId);
    await ctx.prisma.order.update({ where: { id: orderId }, data: { paymentStatus: "paid" } });

    await staff().post(`${ORDERS}/${orderId}/resend`).expect(409);
  });
});

describe("2b — le plafond, réglage du comptable", () => {
  it("vaut « aucun » tant que rien n'est posé, puis se pose et se retire", async () => {
    expect(jsonBody<AccountingSettingsView>(await staff().get(SETTINGS).expect(200))).toEqual({
      paymentLinkMaxCents: null,
    });

    await staff().put(SETTINGS).send({ paymentLinkMaxCents: 50_000 }).expect(204);
    expect(jsonBody<AccountingSettingsView>(await staff().get(SETTINGS).expect(200))).toEqual({
      paymentLinkMaxCents: 50_000,
    });

    await staff().put(SETTINGS).send({ paymentLinkMaxCents: null }).expect(204);
    expect(await ctx.prisma.accountingSettings.count()).toBe(1);
  });

  it("refuse un plafond nul ou négatif à la forme", async () => {
    await staff().put(SETTINGS).send({ paymentLinkMaxCents: 0 }).expect(400);
  });
});

describe("2b — les liens libres", () => {
  async function create(companyId: string, amountCents = 12_000): Promise<CreatedPaymentLink> {
    return jsonBody<CreatedPaymentLink>(
      await staff()
        .post(LINKS)
        .send({ companyId, amountCents, label: "Régularisation août" })
        .expect(201),
    );
  }

  it("crée un lien ouvert, le liste, et journalise sur la société", async () => {
    const { companyId } = await seedCompany();

    const created = await create(companyId);

    expect(created.url).toBe("https://checkout.stripe.test/cs_e2e_" + String(sessionCounter));
    const links = jsonBody<PaymentLinkView[]>(await staff().get(LINKS).expect(200));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      id: created.id,
      companyId,
      amountCents: 12_000,
      status: "open",
      paidAt: null,
    });
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "payment_link.created" },
      select: { subjectType: true, subjectId: true },
    });
    expect(facts).toEqual([{ subjectType: "company", subjectId: companyId }]);
  });

  it("🔴 refuse au-delà du plafond en le nommant, et n'écrit rien", async () => {
    const { companyId } = await seedCompany();
    await staff().put(SETTINGS).send({ paymentLinkMaxCents: 10_000 }).expect(204);

    const refused = await staff()
      .post(LINKS)
      .send({ companyId, amountCents: 10_001, label: "Trop" })
      .expect(409);

    expect(refused.body).toMatchObject({ code: "payments.link.above_cap" });
    expect(JSON.stringify(refused.body)).toContain("100,00");
    expect(await ctx.prisma.paymentLink.count()).toBe(0);
  });

  it("refuse une société inconnue en 404", async () => {
    await staff()
      .post(LINKS)
      .send({ companyId: "co_inexistante", amountCents: 100, label: "Qui ?" })
      .expect(404);
  });

  it("le webhook payé passe le lien à payé, et un rejeu ne change rien", async () => {
    const { companyId } = await seedCompany();
    const created = await create(companyId);
    const row = await ctx.prisma.paymentLink.findUniqueOrThrow({ where: { id: created.id } });

    await webhook({ kind: "link_paid", sessionId: row.stripeSessionId });
    const paid = await ctx.prisma.paymentLink.findUniqueOrThrow({ where: { id: created.id } });
    await webhook({ kind: "link_paid", sessionId: row.stripeSessionId });
    const replayed = await ctx.prisma.paymentLink.findUniqueOrThrow({ where: { id: created.id } });

    expect(paid.status).toBe("paid");
    expect(replayed.paidAt).toEqual(paid.paidAt);
  });

  it("annule, ferme la session, et le webhook d'expiration qui suit ne réécrit rien", async () => {
    const { companyId } = await seedCompany();
    const created = await create(companyId);
    const row = await ctx.prisma.paymentLink.findUniqueOrThrow({ where: { id: created.id } });

    await staff().post(`${LINKS}/${created.id}/cancel`).expect(204);
    await webhook({ kind: "link_expired", sessionId: row.stripeSessionId });

    const after = await ctx.prisma.paymentLink.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.status).toBe("cancelled");
    expect(expiredSessions).toEqual([row.stripeSessionId]);
    await staff().post(`${LINKS}/${created.id}/cancel`).expect(409);
  });

  it("🔴 payé après annulation : passe à payé, et la cloche sonne", async () => {
    const { companyId } = await seedCompany();
    const created = await create(companyId);
    const row = await ctx.prisma.paymentLink.findUniqueOrThrow({ where: { id: created.id } });
    await staff().post(`${LINKS}/${created.id}/cancel`).expect(204);

    await webhook({ kind: "link_paid", sessionId: row.stripeSessionId });

    const after = await ctx.prisma.paymentLink.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.status).toBe("paid");
    expect(after.cancelledAt).not.toBeNull();
    expect(
      await ctx.prisma.staffNotification.count({
        where: { kind: "payment_link.paid_after_cancel" },
      }),
    ).toBe(1);
  });

  it("expire un lien ouvert sur le webhook d'expiration", async () => {
    const { companyId } = await seedCompany();
    const created = await create(companyId);
    const row = await ctx.prisma.paymentLink.findUniqueOrThrow({ where: { id: created.id } });

    await webhook({ kind: "link_expired", sessionId: row.stripeSessionId });

    const after = await ctx.prisma.paymentLink.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.status).toBe("expired");
  });
});
