/**
 * E2E du **webhook Resend** — ce que devient un e-mail après son envoi.
 *
 * Trois invariants, et le premier est le seul qui compte vraiment :
 *
 *  1. **Sans signature valide, rien ne passe.** La route est publique parce que
 *     Resend n'a pas de jeton Auth0 ; elle n'est pas ouverte pour autant. Sans
 *     preuve d'origine, n'importe qui pourrait déclarer que nos e-mails
 *     rebondissent — et on le croirait sur l'écran de santé.
 *  2. **Le même événement ne compte qu'une fois.** Svix réessaie.
 *  3. **L'ordre d'arrivée ne détruit pas l'information.** Un « envoyé » qui
 *     arrive après un « rebondi » ne doit pas effacer le rebond.
 */
import { createHmac } from "node:crypto";

import { AppConfig } from "../src/platform/config/app-config.js";
import { MailJournal } from "../src/platform/mailer/journal/mail-journal.port.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";

const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const ROUTE = "/webhooks/resend";
const PROVIDER_ID = "re_e2e_1";

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

/** Poste un événement signé comme Svix le ferait. */
function post(payload: object, options: { id?: string; signature?: string } = {}) {
  const body = JSON.stringify(payload);
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
  data: { email_id: PROVIDER_ID, bounce: { message: "boîte pleine" } },
};
const sent = { type: "email.sent", data: { email_id: PROVIDER_ID } };

const statusOf = async (): Promise<{ status: string; detail: string } | null> =>
  ctx.prisma.mailSend.findUnique({
    where: { providerId: PROVIDER_ID },
    select: { status: true, detail: true },
  });

describe("le mur du webhook", () => {
  it("🔴 refuse un corps non signé", async () => {
    await ctx.http().post(ROUTE).send(bounced).expect(401);

    expect((await statusOf())?.status).toBe("sent");
  });

  it("🔴 refuse une signature qui ne correspond pas au corps", async () => {
    await post(bounced, { signature: "v1,ZmF1c3NlIHNpZ25hdHVyZQ==" }).expect(401);

    expect((await statusOf())?.status).toBe("sent");
  });

  it("accepte un événement correctement signé", async () => {
    await post(bounced).expect(200);

    expect(await statusOf()).toMatchObject({ status: "bounced", detail: "boîte pleine" });
  });
});

describe("ce que le webhook garantit ensuite", () => {
  it("ne compte qu'une fois un événement livré deux fois", async () => {
    // Svix réessaie : traiter deux fois compterait deux rebonds pour un seul.
    await post(bounced, { id: "msg_repeat" }).expect(200);
    await post(bounced, { id: "msg_repeat" }).expect(200);

    const events = await ctx.prisma.webhookEvent.count({ where: { provider: "resend" } });
    expect(events).toBe(1);
  });

  it("🔴 ne laisse pas un « envoyé » tardif effacer un rebond", async () => {
    // Les webhooks n'ont aucune garantie d'ordre. Sans règle de rang, le
    // dernier arrivé gagnerait — et ferait disparaître la seule information
    // qui demandait une action.
    await post(bounced, { id: "msg_1" }).expect(200);
    await post(sent, { id: "msg_2" }).expect(200);

    expect((await statusOf())?.status).toBe("bounced");
  });

  it("acquitte un type qu'on ne traite pas plutôt que de le faire réessayer", async () => {
    // `email.opened` dit ce qu'une personne a fait de son courrier : ça ne nous
    // regarde pas. Un 5xx le ferait revenir indéfiniment.
    await post(
      { type: "email.opened", data: { email_id: PROVIDER_ID } },
      { id: "msg_open" },
    ).expect(200);

    expect((await statusOf())?.status).toBe("sent");
  });
});
