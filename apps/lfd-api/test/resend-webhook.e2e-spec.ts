/**
 * E2E du **webhook Resend** — ce que devient un e-mail après son envoi (plan
 * `documentation/mail/plan-suivi-des-e-mails.md`, lot T1).
 *
 * Ce que seule cette suite prouve, sur la vraie base :
 *
 *  1. **Sans signature valide, rien ne passe.** La route est publique parce que
 *     Resend n'a pas de jeton Auth0 ; elle n'est pas ouverte pour autant.
 *  2. **Chaque retour est rangé avant d'être appliqué** (`mail.mail_delivery_event`),
 *     et le `svix_id` unique de cette table dédoublonne un rejeu.
 *  3. **Un retour arrivé avant l'envoi n'est pas perdu** : la demande le relit
 *     à la pose de son identifiant, ou le balayeur l'applique.
 *  4. **L'ordre d'arrivée ne détruit pas l'information** : relevé vers le haut.
 *  5. **Aucun texte du fournisseur n'est rangé** — ni au suivi, ni dans
 *     `ops.mail_send`, toujours écrite pendant la transition (décision 5).
 */
import { createHmac } from "node:crypto";

import { MailOutcomeRecorder } from "../src/mail/requests/application/mail-outcome-recorder.js";
import { MailRequest } from "../src/mail/requests/domain/entities/mail-request.js";
import { MailRequestRepository } from "../src/mail/requests/domain/ports/mail-request.repository.js";
import { AppConfig } from "../src/platform/config/app-config.js";
import { MailJournal } from "../src/platform/mailer/journal/mail-journal.port.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const ROUTE = "/webhooks/resend";
const PROVIDER_ID = "re_e2e_1";
const KEY = "e2e.webhook:1";
/** Le texte du fournisseur cite l'adresse : il ne doit être rangé nulle part. */
const PROVIDER_TEXT = "550 5.1.1 cliente@exemple.test: boîte inconnue";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
  // Le secret n'existe pas dans l'environnement de test : sans lui la route
  // refuse TOUT, ce qui est le bon défaut mais ne prouve rien du reste.
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
  await ctx.app.get(MailJournal).recordSend({
    providerId: PROVIDER_ID,
    template: "customer.access-opened",
    recipient: "cliente@exemple.test",
    at: new Date(),
  });
});

/** Une demande acceptée par Resend, par le domaine ; rangée par `save` (sans relecture) ou par `recorder`. */
function acceptedRequest(): MailRequest {
  const request = MailRequest.request({
    id: "mail_e2e_1",
    template: "customer.access-opened",
    brand: "lfc",
    recipient: "Cliente@Exemple.test",
    locale: "fr",
    idempotencyKey: KEY,
    requestedAt: new Date(),
  });
  request.markSent(PROVIDER_ID, new Date());
  return request;
}

/** Poste un événement signé comme Svix le ferait. */
function post(payload: object | string, options: { id?: string; signature?: string } = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const id = options.id ?? "msg_e2e";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(SECRET.replace("whsec_", ""), "base64");
  const mac = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return ctx
    .http()
    .post(ROUTE)
    .set("svix-id", id)
    .set("svix-timestamp", timestamp)
    .set("svix-signature", options.signature ?? `v1,${mac}`)
    .set("content-type", "application/json")
    .send(body);
}

const bounced = {
  type: "email.bounced",
  created_at: new Date().toISOString(),
  data: {
    email_id: PROVIDER_ID,
    bounce: { message: PROVIDER_TEXT, type: "Permanent", subType: "General" },
  },
};
const delivered = { type: "email.delivered", data: { email_id: PROVIDER_ID } };

const requestRow = () =>
  ctx.prisma.mailRequest.findUnique({
    where: { idempotencyKey: KEY },
    select: { delivery: true, deliveryKind: true, deliveryAt: true, recipientKey: true },
  });

const journalRow = () =>
  ctx.prisma.mailSend.findUnique({
    where: { providerId: PROVIDER_ID },
    select: { status: true, detail: true },
  });

const storedEvents = () =>
  ctx.prisma.mailDeliveryEvent.findMany({ orderBy: { receivedAt: "asc" } });

describe("le mur du webhook", () => {
  it("🔴 refuse un corps non signé, sans rien ranger", async () => {
    await ctx.http().post(ROUTE).send(bounced).expect(401);

    expect(await storedEvents()).toEqual([]);
    expect((await journalRow())?.status).toBe("sent");
  });

  it("🔴 refuse une signature qui ne correspond pas au corps", async () => {
    await post(bounced, { signature: "v1,ZmF1c3NlIHNpZ25hdHVyZQ==" }).expect(401);

    expect(await storedEvents()).toEqual([]);
  });
});

describe("ranger, puis appliquer", () => {
  it("range le retour et l'applique à la demande, avec son genre et sans son texte", async () => {
    await ctx.app.get(MailRequestRepository).save(acceptedRequest());

    await post(bounced).expect(200);

    expect(await requestRow()).toMatchObject({
      delivery: "bounced",
      deliveryKind: "Permanent/General",
      recipientKey: "cliente@exemple.test",
    });
    expect(await journalRow()).toEqual({ status: "bounced", detail: "Permanent/General" });
    const everything = JSON.stringify([
      await storedEvents(),
      await requestRow(),
      await journalRow(),
    ]);
    expect(everything).not.toContain("boîte inconnue");
    expect(everything).not.toContain("5.1.1");
  });

  it("un webhook rejoué n'est rangé qu'une fois", async () => {
    await post(bounced, { id: "msg_repeat" }).expect(200);
    await post(bounced, { id: "msg_repeat" }).expect(200);

    expect(await storedEvents()).toHaveLength(1);
  });

  it("🔴 un `delivered` arrivé après un `bounced` ne l'efface pas", async () => {
    await ctx.app.get(MailRequestRepository).save(acceptedRequest());

    await post(bounced, { id: "msg_1" }).expect(200);
    await post(delivered, { id: "msg_2" }).expect(200);

    expect((await requestRow())?.delivery).toBe("bounced");
    expect((await journalRow())?.status).toBe("bounced");
    expect(await storedEvents()).toHaveLength(2);
  });

  it.each([
    ["`email.opened`", { type: "email.opened", data: { email_id: PROVIDER_ID } }],
    ["`email.sent`", { type: "email.sent", data: { email_id: PROVIDER_ID } }],
    // Un corps qui n'est pas du JSON est refusé (400) par l'analyseur d'Express
    // avant le handler ; l'illisible se joue donc ici sur la FORME.
    ["un retour de forme illisible", { type: "email.bounced", data: "?" }],
  ])("acquitte %s sans rien ranger", async (_label, payload) => {
    await post(payload, { id: "msg_ignored" }).expect(200);

    expect(await storedEvents()).toEqual([]);
  });
});

describe("un retour arrivé avant l'envoi (bloquant 1 de vitruve)", () => {
  it("🔴 est rangé, puis appliqué quand la demande pose son identifiant", async () => {
    await post(bounced, { id: "msg_early" }).expect(200);
    expect(await requestRow()).toBeNull();
    expect(await storedEvents()).toHaveLength(1);

    await ctx.app.get(MailOutcomeRecorder).save(acceptedRequest());

    expect(await requestRow()).toMatchObject({
      delivery: "bounced",
      deliveryKind: "Permanent/General",
    });
  });

  it("le balayeur applique celui que la pose a manqué", async () => {
    await post(bounced, { id: "msg_missed" }).expect(200);
    // Rangée sans relecture : la course où le webhook passe entre les deux.
    await ctx.app.get(MailRequestRepository).save(acceptedRequest());
    expect((await requestRow())?.delivery).toBeNull();

    const response = await ctx
      .http()
      .post("/admin/mail/requests/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);

    expect(response.body).toMatchObject({ deliveriesApplied: 1 });
    expect((await requestRow())?.delivery).toBe("bounced");
  });
});
