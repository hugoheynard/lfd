/**
 * E2E de **la cloche d'un e-mail de commande non reçu**
 * (`documentation/mail/le-sujet-des-e-mails.md`, lot E4), contre le vrai
 * Postgres.
 *
 * Ce que seule cette suite prouve :
 *
 *  1. un webhook `email.bounced` signé sur l'e-mail d'une commande passée par
 *     le vrai chemin écrit `mail.delivery_failed` à la boîte d'envoi, et
 *     l'abonné des commandes sonne une cloche qui mène à la commande — sans
 *     un `@` ni dans le fait, ni dans la cloche ;
 *  2. les deux chemins du balayeur (retour manqué, orphelin relancé) écrivent
 *     le fait AVEC ses sujets — la lecture des orphelins les joint (E4) ;
 *  3. deux fiches sur un même identifiant fournisseur : deux faits.
 *
 * Seuls le transport (le mailer) et la passerelle de carte sont doublés.
 */
import { createHmac } from "node:crypto";

import { MailerIdempotencyInFlightError, type MailReceipt, type SendMailArgs } from "@lfd/mailer";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { MAIL_DELIVERY_FAILED } from "../src/mail/channels/deliveries/mail-delivery-failed.event.js";
import { Mail } from "../src/mail/channels/requests/mail.js";
import { MailRequest } from "../src/mail/requests/domain/entities/mail-request.js";
import { MailRequestRepository } from "../src/mail/requests/domain/ports/mail-request.repository.js";
import type { B2bMails } from "../src/mail/templates/mail-templates.js";
import { MAILER, type B2bMailer } from "../src/mail/templates/mailer.tokens.js";
import { AppConfig } from "../src/platform/config/app-config.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { Clock } from "../src/platform/time/clock.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { cardGatewayDouble, payByCard, pickupSite, placeOrder } from "./order-factory.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const BUYER_EMAIL = "camille.cloche@halles.test";
const ORDER_SUBJECT = { type: "order", id: "ord_cloche" } as const;

/** Le transport doublé : il accepte et numérote, ou répond « même clé en cours ». */
class NumberingMailer implements B2bMailer {
  readonly enabled = true;
  accepted = 0;
  inFlight = false;

  send<K extends keyof B2bMails>(_args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    if (this.inFlight) {
      return Promise.reject(new MailerIdempotencyInFlightError("Resend : même clé en cours"));
    }
    this.accepted += 1;
    return Promise.resolve({ providerId: `re_bell_${String(this.accepted)}` });
  }
}

const mailer = new NumberingMailer();
let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: MAILER, value: mailer },
      { token: PaymentGateway, value: cardGatewayDouble("pi_cloche") },
    ],
  });
  // Le secret du webhook n'existe pas dans l'environnement de test.
  const config = ctx.app.get(AppConfig);
  const real = config.mailerConfig();
  config.mailerConfig = (): ReturnType<AppConfig["mailerConfig"]> => ({
    ...real,
    webhookSecret: SECRET,
  });
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  mailer.accepted = 0;
  mailer.inFlight = false;
});

/** Poste un rebond signé comme Svix le ferait. */
async function bounce(providerId: string, svixId: string): Promise<void> {
  const body = JSON.stringify({
    type: "email.bounced",
    created_at: new Date().toISOString(),
    data: {
      email_id: providerId,
      bounce: { message: `550 ${BUYER_EMAIL}: inconnue`, type: "Permanent", subType: "General" },
    },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(SECRET.replace("whsec_", ""), "base64");
  const mac = createHmac("sha256", key).update(`${svixId}.${timestamp}.${body}`).digest("base64");
  await ctx
    .http()
    .post("/webhooks/resend")
    .set("svix-id", svixId)
    .set("svix-timestamp", timestamp)
    .set("svix-signature", `v1,${mac}`)
    .set("content-type", "application/json")
    .send(body)
    .expect(200);
}

async function sweep(): Promise<void> {
  await ctx
    .http()
    .post("/admin/mail/requests/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
}

const failedFacts = () =>
  ctx.prisma.outboxMessage.findMany({
    where: { type: MAIL_DELIVERY_FAILED },
    orderBy: { key: "asc" },
  });

/** Une demande acceptée sous cet identifiant, avec un sujet, rangée par son dépôt. */
async function acceptedRequest(id: string, providerId: string): Promise<void> {
  const now = ctx.app.get(Clock).now();
  const request = MailRequest.request({
    id,
    template: "customer.order-ready",
    brand: "lfc",
    recipient: BUYER_EMAIL,
    locale: "fr",
    idempotencyKey: `e2e:bell:${id}`,
    requestedAt: now,
    subjects: [ORDER_SUBJECT],
  });
  request.markSent(providerId, now);
  await ctx.app.get(MailRequestRepository).save(request);
}

describe("un rebond sur l'e-mail d'une commande sonne la cloche de la commande", () => {
  it("webhook signé → fait → cloche vers la commande, sans adresse", async () => {
    const buyer = await createUser(ctx.prisma, { auth0Sub: "auth0|cloche", email: BUYER_EMAIL });
    const order = await placeOrder(ctx, {
      buyerUserId: buyer.id,
      fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
      settlement: "card",
    });
    await payByCard(ctx, order);
    await ctx.drain();
    const placed = await ctx.prisma.mailRequest.findFirstOrThrow({
      where: {
        template: "customer.order-placed",
        subjects: { some: { subjectType: "order", subjectId: order.id } },
      },
    });

    await bounce(placed.providerId ?? "", "msg_bell_1");
    await ctx.drain();
    // Un second rebond du même e-mail : la fiche est déjà en échec, rien ne resonne.
    await bounce(placed.providerId ?? "", "msg_bell_2");
    await ctx.drain();

    const facts = await failedFacts();
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toMatchObject({
      requestId: placed.id,
      template: "customer.order-placed",
      subjects: [{ type: "order", id: order.id }],
      delivery: "bounced",
    });
    const bells = await ctx.prisma.staffNotification.findMany({
      where: { kind: "order.mail_failed" },
    });
    expect(bells).toEqual([
      expect.objectContaining({
        link: `/commandes/${order.id}`,
        idempotencyKey: `mail.failed:${placed.id}:${order.id}`,
        audience: "b2b_orders:read",
      }),
    ]);
    expect(bells[0]?.body).toContain(order.orderNumber);
    expect(JSON.stringify(facts)).not.toContain("@");
    expect(JSON.stringify(bells)).not.toContain("@");
  });
});

describe("le fait part avec ses sujets, quel que soit le chemin", () => {
  it("deux fiches sur un même identifiant fournisseur : deux faits", async () => {
    await acceptedRequest("mail_bell_a", "re_shared");
    await acceptedRequest("mail_bell_b", "re_shared");

    await bounce("re_shared", "msg_shared");

    expect((await failedFacts()).map((fact) => fact.key)).toEqual([
      `${MAIL_DELIVERY_FAILED}:mail_bell_a`,
      `${MAIL_DELIVERY_FAILED}:mail_bell_b`,
    ]);
  });

  it("le balayeur applique un retour manqué : le fait porte les sujets", async () => {
    await bounce("re_missed", "msg_missed");
    // Rangée après le webhook, sans relecture : la course qu'il rattrape.
    await acceptedRequest("mail_bell_missed", "re_missed");
    expect(await failedFacts()).toEqual([]);

    await sweep();

    expect((await failedFacts()).map((fact) => fact.payload)).toEqual([
      expect.objectContaining({ requestId: "mail_bell_missed", subjects: [ORDER_SUBJECT] }),
    ]);
  });

  /** Régression E1 : la lecture des orphelins relisait la demande sans ses sujets. */
  it("le balayeur relance un orphelin qui relit un rebond déjà rangé : le fait porte les sujets", async () => {
    mailer.inFlight = true;
    await ctx.app.get(UnitOfWork).run(() =>
      ctx.app.get(Mail).send({
        template: "staff.access-restored",
        to: "equipe@example.test",
        data: { firstName: "Ada", backOfficeUrl: "https://admin.example.test" },
        idempotencyKey: "e2e:bell:orphan",
        subjects: [ORDER_SUBJECT],
      }),
    );
    await ctx.drain();
    mailer.inFlight = false;
    // Le rebond arrive avant la relance : il attend sa demande.
    await bounce("re_bell_1", "msg_orphan");
    const past = new Date(ctx.app.get(Clock).now().getTime() - 15 * 60 * 1000);
    await ctx.prisma.mailRequest.update({
      where: { idempotencyKey: "e2e:bell:orphan" },
      data: { firstAttemptAt: past, lastAttemptAt: past },
    });

    await sweep();

    const facts = await failedFacts();
    expect(facts.map((fact) => fact.payload)).toEqual([
      expect.objectContaining({ subjects: [ORDER_SUBJECT], delivery: "bounced" }),
    ]);
  });
});
