/**
 * E2E du **sujet des e-mails** (`documentation/mail/le-sujet-des-e-mails.md`,
 * lots E1 et E2), contre le vrai Postgres : une commande passée par le vrai
 * chemin demande ses e-mails avec son sujet, la table enfant les range, et la
 * fiche commande les lit par `GET /admin/orders/:orderId/mails` — après avoir
 * prouvé la commande, sans jamais servir l'adresse. Le suivi des envois sert
 * les mêmes sujets.
 *
 * Seuls le transport (le mailer), la passerelle de carte et la signature du
 * jeton staff sont doublés.
 */
import type {
  MailSendDetailView,
  MailSendListView,
  OrderMailsView,
  RoleGrant,
} from "@lfd/contracts";
import type { MailReceipt, SendMailArgs } from "@lfd/mailer";
import type request from "supertest";

import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { MailRequest } from "../src/mail/requests/domain/entities/mail-request.js";
import { MailRequestRepository } from "../src/mail/requests/domain/ports/mail-request.repository.js";
import type { B2bMails } from "../src/mail/templates/mail-templates.js";
import { MAILER, type B2bMailer } from "../src/mail/templates/mailer.tokens.js";
import { Clock } from "../src/platform/time/clock.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import {
  cardGatewayDouble,
  payByCard,
  pickupSite,
  placeOrder,
  type PlacedTestOrder,
} from "./order-factory.js";

const BUYER_EMAIL = "camille.sujet@halles.test";

/** Le transport doublé : il accepte, et rend un identifiant fournisseur. */
class AcceptingMailer implements B2bMailer {
  readonly enabled = true;
  private accepted = 0;

  send<K extends keyof B2bMails>(_args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    this.accepted += 1;
    return Promise.resolve({ providerId: `re_subject_${String(this.accepted)}` });
  }
}

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: MAILER, value: new AcceptingMailer() },
      { token: CardProviders, value: cardGatewayDouble("pi_sujet") },
    ],
  });
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
});

const staff = (): request.Agent => ctx.asSub(E2E_STAFF_SUB);

/** Une commande passée et réglée par le vrai chemin : ses e-mails sont demandés et partis. */
async function placedOrder(): Promise<PlacedTestOrder> {
  const buyer = await createUser(ctx.prisma, {
    auth0Sub: "auth0|sujet-buyer",
    email: BUYER_EMAIL,
  });
  const order = await placeOrder(ctx, {
    buyerUserId: buyer.id,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    settlement: "card",
  });
  await payByCard(ctx, order);
  await ctx.drain();
  return order;
}

/** Une demande qui nomme un sujet, posée par l'agrégat et rangée par son dépôt. */
async function requestFor(orderId: string): Promise<void> {
  const request = MailRequest.request({
    id: "mail_orphan",
    template: "customer.order-ready",
    brand: "lfc",
    recipient: BUYER_EMAIL,
    locale: "fr",
    idempotencyKey: `e2e:orphan:${orderId}`,
    requestedAt: ctx.app.get(Clock).now(),
    subjects: [{ type: "order", id: orderId }],
  });
  await ctx.app.get(MailRequestRepository).save(request);
}

/** Un rôle créé à l'écran, qui ne tient que ces droits, et une personne qui le porte. */
async function holderOf(key: string, grants: readonly RoleGrant[]): Promise<request.Agent> {
  await staff().post("/admin/staff-roles").send({ key, label: key, grants }).expect(201);
  const sub = `staff-${key}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: key,
      email: `${key}@lfc.test`,
      role: null,
      roleKey: key,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

describe("GET /admin/orders/:orderId/mails — les e-mails d'une commande", () => {
  it("une commande passée lit son e-mail de confirmation et son état réel, sans adresse", async () => {
    const order = await placedOrder();

    const res = await staff().get(`/admin/orders/${order.id}/mails`).expect(200);
    const view = jsonBody<OrderMailsView>(res);

    expect(view.items.map((item) => item.template)).toContain("customer.order-placed");
    const placed = view.items.find((item) => item.template === "customer.order-placed");
    expect(placed).toMatchObject({ state: "accepted", delivery: null, deliveryAt: null });
    expect(JSON.stringify(view)).not.toContain(BUYER_EMAIL);
    expect(JSON.stringify(view)).not.toContain("@");
  });

  it("la table enfant range le sujet de chaque e-mail de la commande", async () => {
    const order = await placedOrder();

    const subjects = await ctx.prisma.mailRequestSubject.findMany({
      where: { subjectType: "order", subjectId: order.id },
    });
    expect(subjects.length).toBeGreaterThan(0);
  });

  /** Objection S8 : un identifiant arbitraire ne lit pas les e-mails rangés sous lui. */
  it("404 nommé sur une commande inconnue, même si des fiches portent cet identifiant", async () => {
    await requestFor("ord_inconnue");

    const res = await staff().get("/admin/orders/ord_inconnue/mails").expect(404);
    expect(JSON.stringify(res.body)).toContain("orders.not_found");
  });

  it("sans le droit de lire les commandes, 403", async () => {
    const order = await placedOrder();
    const agent = await holderOf("retrait-seul-mails", [
      { resource: "handover_counter", action: "read" },
    ]);

    await agent.get(`/admin/orders/${order.id}/mails`).expect(403);
  });
});

describe("le suivi des envois sert les sujets (règle 9)", () => {
  it("la liste et le détail portent le sujet `order` de l'e-mail", async () => {
    const order = await placedOrder();

    const list = jsonBody<MailSendListView>(await staff().get("/admin/mail/sends").expect(200));
    const placed = list.items.find((item) => item.template === "customer.order-placed");
    expect(placed?.subjects).toEqual([{ type: "order", id: order.id }]);

    const detail = jsonBody<MailSendDetailView>(
      await staff()
        .get(`/admin/mail/sends/${placed?.id ?? ""}`)
        .expect(200),
    );
    expect(detail.subjects).toEqual([{ type: "order", id: order.id }]);
  });
});
