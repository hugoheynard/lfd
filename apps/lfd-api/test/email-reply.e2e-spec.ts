/**
 * E2E des **réponses des clients par e-mail** (plan
 * `documentation/demandes-client/plan-reponses-par-e-mail.md`, R1 et R2) —
 * vrai Postgres, lecteur Resend doublé.
 *
 * Ce que seul le vrai chemin prouve : qu'un webhook `email.received` signé
 * traverse le récepteur, le port relié par `appBootstrap` et le rangement,
 * jusqu'à la boîte des demandes ; que l'unicité de l'identifiant du message
 * tient en base (un rejeu ne range rien) ; qu'une réponse automatique
 * n'écrit rien ; et que le `svix-id` n'est pas consommé pour ce type.
 */
import { createHmac } from "node:crypto";

import type { CustomerRequestView } from "@lfd/contracts";
import type { ReceivedMail } from "@lfd/mailer";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { AppConfig } from "../src/platform/config/app-config.js";
import { InboundMailReader } from "../src/platform/mailer/inbound/inbound-mail.reader.js";
import { InboundMailUnreadableError } from "../src/platform/mailer/inbound/inbound-mail-unreadable.error.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";

const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const ROUTE = "/webhooks/resend";

/** Les messages que « Resend » rend, par identifiant ; un absent est une panne. */
const inbox = new Map<string, ReceivedMail>();
const resendReceiving = {
  read: (emailId: string): Promise<ReceivedMail> => {
    const mail = inbox.get(emailId);
    return mail === undefined
      ? Promise.reject(new InboundMailUnreadableError(emailId, "introuvable"))
      : Promise.resolve(mail);
  },
};

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: InboundMailReader, value: resendReceiving },
    ],
  });
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
  inbox.clear();
  // Le motif système est une donnée de RÉFÉRENCE posée par la migration
  // `20261028230100_la_reponse_par_e_mail` ; le `TRUNCATE` du harnais
  // l'emporte, et le domaine refuse — à raison — de le créer. On le remet
  // tel que la migration l'écrit.
  await ctx.prisma.requestReason.create({
    data: {
      id: "system_email_reply",
      kind: "email_reply",
      labelFr: "Réponse à un e-mail",
      labelEn: "Reply to an e-mail",
      labelIt: "Risposta a un'e-mail",
      recipientEmail: "reponses@reponses.lafoliecoffee.info",
      audience: "both",
      priority: "medium",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
});

/** Poste un événement signé comme Svix le ferait. */
function post(payload: object, id = "msg_e2e") {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(SECRET.replace("whsec_", ""), "base64");
  const mac = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return ctx
    .http()
    .post(ROUTE)
    .set("svix-id", id)
    .set("svix-timestamp", timestamp)
    .set("svix-signature", `v1,${mac}`)
    .set("content-type", "application/json")
    .send(body);
}

function received(emailId: string): object {
  return { type: "email.received", data: { email_id: emailId, from: "x", subject: "x" } };
}

function mail(overrides: Partial<ReceivedMail> = {}): ReceivedMail {
  return {
    id: "in_e2e_1",
    from: "Jean Martin <jean.reponse@exemple.test>",
    subject: "Re: Votre commande",
    text: "Merci, à demain.\n\n> Votre commande est prête",
    html: null,
    headers: {},
    attachments: [{ filename: "plan.pdf", contentType: "application/pdf", sizeBytes: 1234 }],
    ...overrides,
  };
}

async function emailReplies(): Promise<CustomerRequestView[]> {
  const response = await ctx
    .asSub(E2E_STAFF_SUB)
    .get("/admin/customer-requests?status=pending&kind=email_reply")
    .expect(200);
  return jsonBody<CustomerRequestView[]>(response);
}

describe("une réponse par e-mail, de Resend à la boîte des demandes", () => {
  /**
   * Régression (2026-10-28, au bâti) : le port optionnel du récepteur était
   * déclaré sous une union `| null` sans jeton ; Nest injectait `null`, et
   * chaque e-mail reçu échouait en « port non relié ».
   */
  it("un webhook signé range une demande `email_reply`, lue par l'admin", async () => {
    const account = await createUser(ctx.prisma, {
      auth0Sub: "auth0|reponse-mail",
      email: "jean.reponse@exemple.test",
    });
    inbox.set("in_e2e_1", mail());

    await post(received("in_e2e_1")).expect(200);
    await ctx.drain();

    const replies = await emailReplies();
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({
      kind: "email_reply",
      reasonId: "system_email_reply",
      reasonLabel: "Réponse à un e-mail",
      authorName: "Jean Martin",
      authorEmail: "jean.reponse@exemple.test",
      message: "Merci, à demain.",
      userId: account.id,
      details: {
        kind: "email_reply",
        subject: "Re: Votre commande",
        attachments: [{ filename: "plan.pdf", contentType: "application/pdf", sizeBytes: 1234 }],
        senderVerified: false,
        orderId: null,
      },
    });
    // Le `svix-id` n'est PAS consommé pour un e-mail reçu.
    expect(await ctx.prisma.webhookEvent.count({ where: { provider: "resend" } })).toBe(0);
  });

  it("le rejeu du même message ne range rien de plus", async () => {
    inbox.set("in_e2e_1", mail());

    await post(received("in_e2e_1"), "msg_a").expect(200);
    await post(received("in_e2e_1"), "msg_a").expect(200);
    await post(received("in_e2e_1"), "msg_b").expect(200);

    expect(await emailReplies()).toHaveLength(1);
  });

  it("une réponse automatique est écartée : aucune demande", async () => {
    inbox.set(
      "in_e2e_auto",
      mail({ id: "in_e2e_auto", headers: { "Auto-Submitted": "auto-replied" } }),
    );

    await post(received("in_e2e_auto")).expect(200);

    expect(await emailReplies()).toEqual([]);
  });

  it("un message que Resend ne rend pas fait échouer le webhook, pour être rejoué", async () => {
    const response = await post(received("in_e2e_absent"));

    expect(response.status).toBeGreaterThanOrEqual(500);
    inbox.set("in_e2e_absent", mail({ id: "in_e2e_absent" }));
    await post(received("in_e2e_absent")).expect(200);
    expect(await emailReplies()).toHaveLength(1);
  });

  it("le motif système ne se révise pas par la route des motifs", async () => {
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/request-reasons/system_email_reply/archive")
      .expect(409);
  });
});
