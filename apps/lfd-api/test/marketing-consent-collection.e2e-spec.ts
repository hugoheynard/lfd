/**
 * Le recueil du consentement marketing, contre le vrai Postgres (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, lots C2, C3, C5).
 *
 * Ce qu'un test unitaire ne peut pas dire : que la case portée par le geste
 * d'inscription et par la commande d'un invité arrive au registre APRÈS la
 * validation, par le vrai canal du bloc `mail` ; que le rejeu d'une commande
 * n'écrit rien de plus ; que « Mes préférences » ne lit que l'adresse du
 * compte ; que la lettre du pied de page répond la même chose à tout le
 * monde ; qu'un changement d'adresse emporte l'état ; et que la purge rend
 * une réinscription jamais confirmée à sa désinscription.
 *
 * Doublés : le transport (il garde chaque e-mail), le fournisseur d'identité
 * (Auth0), la passerelle de paiement, l'origine publique de l'espace (la
 * boutique n'a pas d'URL en test) et le cran de purge (`on`).
 */
import { randomUUID } from "node:crypto";

import {
  MARKETING_CONSENT_TEXT_VERSIONS,
  type MyMarketingPreferencesView,
  type PlaceShopOrderPayload,
} from "@lfd/contracts";
import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import { PlaceShopOrderHandler } from "../src/b2b/orders/application/commands/place-shop-order.handler.js";
import { NO_LOGIN_METHODS } from "../src/b2b/account/domain/ports/__tests__/login-method-doubles.js";
import { CustomerIdentityPort } from "../src/b2b/account/domain/ports/customer-identity.port.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { MarketingConsent } from "../src/mail/channels/marketing/marketing-consent.js";
import { SpacePublicOrigins } from "../src/mail/marketing/domain/ports/space-public-origins.js";
import { MAIL_REQUEST_PURGE_MODE } from "../src/mail/requests/domain/services/mail-request-retention.js";
import type { MailBrandCode } from "../src/mail/requests/domain/value-objects/mail-brand.js";
import type { B2bMails } from "../src/mail/templates/mail-templates.js";
import { MAIL_TRANSPORT, type B2bMailer } from "../src/mail/templates/mailer.tokens.js";
import type { ProvisionedIdentity } from "../src/platform/shared/identity/provisioned-identity.js";
import { bootstrapE2e, daysAgo, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { placeShopOrderSeeingTotal, type Unseen } from "./seen-total-shop-command.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const ORIGIN = "https://shop.lfc.test";
const CONFIRM = "customer.marketing-confirm";
const SOCIETY = MARKETING_CONSENT_TEXT_VERSIONS.society;
const CHECKED = { accepted: true, textVersion: SOCIETY, locale: "fr" } as const;

class ShopOrigin extends SpacePublicOrigins {
  originOf(space: MailBrandCode): string | null {
    return space === "lfc" ? ORIGIN : null;
  }
}

/** Le transport doublé : il garde le modèle et le destinataire, rien ne part. */
class KeepingTransport implements B2bMailer {
  readonly enabled = true;
  readonly sent: { readonly template: string; readonly to: string }[] = [];

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    this.sent.push({ template: args.template, to: String(args.to) });
    return Promise.resolve({ providerId: `re_${String(this.sent.length)}` });
  }

  confirmationsTo(address: string): number {
    return this.sent.filter((one) => one.template === CONFIRM && one.to === address).length;
  }
}

const identityDouble: CustomerIdentityPort = {
  ...NO_LOGIN_METHODS,
  provision: (): Promise<ProvisionedIdentity> =>
    Promise.resolve({ subject: "auth0|double", passwordSetupUrl: "https://exemple.test/mdp" }),
  issuePasswordLink: (): Promise<string> => Promise.resolve("https://exemple.test/mdp"),
  changeEmail: (): Promise<void> => Promise.resolve(),
};

let intentSeq = 0;
const fakeGateway = {
  createIntent: () => {
    intentSeq += 1;
    const paymentIntentId = `pi_consent_${String(intentSeq)}`;
    return Promise.resolve({ paymentIntentId, clientSecret: `${paymentIntentId}_secret` });
  },
  retrieveIntent: () =>
    Promise.resolve({
      paymentIntentId: "pi_consent_1",
      clientSecret: "pi_consent_1_secret",
      state: "awaiting_payment" as const,
    }),
  publishableKey: () => "pk_public",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

const transport = new KeepingTransport();
let ctx: E2eContext;
let consent: MarketingConsent;
let pickupId = "";
let ipSeq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: MAIL_TRANSPORT, value: transport },
      { token: SpacePublicOrigins, value: new ShopOrigin() },
      { token: CustomerIdentityPort, value: identityDouble },
      { token: PaymentGateway, value: fakeGateway },
      { token: MAIL_REQUEST_PURGE_MODE, value: "on" },
    ],
  });
  consent = ctx.app.get(MarketingConsent);
});

beforeEach(async () => {
  await ctx.reset();
  transport.sent.length = 0;
  const point = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  pickupId = point.id;
});

afterAll(async () => {
  await ctx.close();
});

const registry = () =>
  ctx.prisma.mailMarketingPreference.findMany({ orderBy: [{ recipientKey: "asc" }] });

/** Une IP par test : le seau par IP du limiteur vit le temps de la suite. */
function visitor() {
  ipSeq += 1;
  return ctx.http().set("x-lfc-client-ip", `203.0.113.${String(ipSeq)}`);
}

function profile(email: string, marketingConsent?: Readonly<Record<string, unknown>>) {
  return {
    firstName: "Camille",
    lastName: "Durand",
    email,
    phone: "",
    ...(marketingConsent === undefined ? {} : { marketingConsent }),
  };
}

function guestOrder(
  over: Partial<Unseen<PlaceShopOrderPayload>> = {},
): Unseen<PlaceShopOrderPayload> {
  return {
    idempotencyKey: randomUUID(),
    salesTerms: null,
    buyer: { firstName: "Camille", email: "camille@visiteur.fr", phone: "0600000000" },
    fulfillmentMethod: "pickup",
    requestedWindow: { start: "07:00", end: "08:00" },
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddressId: pickupId,
    requestedDeliveryDate: serviceDay(),
    note: "",
    lines: [{ sku: "VIE-001-1", quantity: 3 }],
    ...over,
  };
}

async function placeGuest(payload: Unseen<PlaceShopOrderPayload>) {
  const placed = await placeShopOrderSeeingTotal(ctx.app.get(PlaceShopOrderHandler), payload);
  await ctx.drain();
  return placed;
}

describe("C2 — la case à l'inscription", () => {
  it("adresse prouvée, case cochée : `accepted` tout de suite, référencée par le compte", async () => {
    const user = await createUser(ctx.prisma, {
      auth0Sub: "auth0|prouve",
      email: "prouve@exemple.fr",
      emailVerified: true,
    });

    await ctx
      .asSub("auth0|prouve")
      .patch("/me/profile")
      .send(profile("prouve@exemple.fr", CHECKED))
      .expect(200);
    await ctx.drain();

    expect(await registry()).toMatchObject([
      {
        recipientKey: "prouve@exemple.fr",
        status: "accepted",
        acceptedWhere: "signup",
        acceptedRef: user.id,
        acceptedTextVersion: SOCIETY,
        acceptedLocale: "fr",
      },
    ]);
    expect(transport.confirmationsTo("prouve@exemple.fr")).toBe(0);
  });

  it("adresse non prouvée : `pending`, et l'e-mail de confirmation part", async () => {
    await createUser(ctx.prisma, { auth0Sub: "auth0|neuf", email: "neuf@exemple.fr" });

    await ctx
      .asSub("auth0|neuf")
      .patch("/me/profile")
      .send(profile("neuf@exemple.fr", CHECKED))
      .expect(200);
    await ctx.drain();

    expect(await registry()).toMatchObject([{ status: "pending", acceptedWhere: "signup" }]);
    expect(transport.confirmationsTo("neuf@exemple.fr")).toBe(1);
  });

  it("une case non cochée, ou absente, n'écrit rien", async () => {
    await createUser(ctx.prisma, { auth0Sub: "auth0|vide", email: "vide@exemple.fr" });
    const unchecked = { accepted: false, textVersion: SOCIETY, locale: "fr" };

    await ctx
      .asSub("auth0|vide")
      .patch("/me/profile")
      .send(profile("vide@exemple.fr", unchecked))
      .expect(200);
    await ctx.asSub("auth0|vide").patch("/me/profile").send(profile("vide@exemple.fr")).expect(200);
    await ctx.drain();

    expect(await registry()).toEqual([]);
  });

  it("une version de texte inconnue est refusée à la forme (400)", async () => {
    await createUser(ctx.prisma, { auth0Sub: "auth0|forme", email: "forme@exemple.fr" });
    await ctx
      .asSub("auth0|forme")
      .patch("/me/profile")
      .send(profile("forme@exemple.fr", { ...CHECKED, textVersion: "inventee" }))
      .expect(400);
  });
});

describe("C2 — le changement d'adresse emporte l'état (règle 24)", () => {
  it("une désinscription protège la nouvelle adresse ; un accord la suit", async () => {
    await createUser(ctx.prisma, { auth0Sub: "auth0|demenage", email: "avant@exemple.fr" });
    await consent.unsubscribe("lfc", "avant@exemple.fr", "link");

    await ctx
      .asSub("auth0|demenage")
      .patch("/me/profile")
      .send(profile("apres@exemple.fr"))
      .expect(200);
    await ctx.drain();

    expect(await consent.preferenceOf("lfc", "apres@exemple.fr")).toBe("unsubscribed");
    expect(await consent.preferenceOf("lfc", "avant@exemple.fr")).toBe("unsubscribed");
  });
});

describe("C2 — la case à la commande d'un invité", () => {
  it("cochée : `pending` et l'e-mail après la validation ; le rejeu n'écrit rien de plus", async () => {
    const payload = guestOrder({ marketingConsent: CHECKED });

    const placed = await placeGuest(payload);

    expect(await registry()).toMatchObject([
      {
        recipientKey: "camille@visiteur.fr",
        status: "pending",
        acceptedWhere: "order",
        acceptedRef: placed.id,
      },
    ]);
    expect(transport.confirmationsTo("camille@visiteur.fr")).toBe(1);

    // Le rejeu, même avec une autre réponse : la première fait foi (règle 21).
    const replayed = await placeGuest({
      ...payload,
      marketingConsent: { ...CHECKED, locale: "it" },
    });
    expect(replayed.id).toBe(placed.id);
    expect(await registry()).toHaveLength(1);
    expect(transport.confirmationsTo("camille@visiteur.fr")).toBe(1);
  });

  it("non cochée : rien au registre, aucun e-mail de confirmation", async () => {
    await placeGuest(guestOrder({ marketingConsent: { ...CHECKED, accepted: false } }));
    await placeGuest(guestOrder());

    expect(await registry()).toEqual([]);
    expect(transport.confirmationsTo("camille@visiteur.fr")).toBe(0);
  });

  it("une adresse désinscrite qui coche quand même : ignorée, sans e-mail (règle 17)", async () => {
    await consent.unsubscribe("lfc", "camille@visiteur.fr", "one_click");

    await placeGuest(guestOrder({ marketingConsent: CHECKED }));

    expect((await registry()).map((row) => row.status)).toEqual(["unsubscribed"]);
    expect(transport.confirmationsTo("camille@visiteur.fr")).toBe(0);
  });
});

describe("C2, C3 — « Mes préférences » et la case à la commande d'un client connecté", () => {
  it("ne répond que pour l'adresse du compte, jamais pour une adresse reçue", async () => {
    await createUser(ctx.prisma, { auth0Sub: "auth0|moi", email: "moi@exemple.fr" });
    await consent.unsubscribe("lfc", "autre@exemple.fr", "link");

    const view = jsonBody<MyMarketingPreferencesView>(
      await ctx
        .asSub("auth0|moi")
        .get("/me/marketing")
        .query({ email: "autre@exemple.fr" })
        .expect(200),
    );

    expect(view).toEqual({
      spaces: [{ space: "lfc", state: "not_subscribed", askable: true }],
      partnersOffered: false,
    });
  });

  it("sans jeton : refusé", async () => {
    await ctx.http().get("/me/marketing").expect(401);
  });

  it("s'inscrire, se désinscrire, se réinscrire (double confirmation : adresse non prouvée)", async () => {
    await createUser(ctx.prisma, { auth0Sub: "auth0|pref", email: "pref@exemple.fr" });
    const me = () => ctx.asSub("auth0|pref");
    const state = async () =>
      jsonBody<MyMarketingPreferencesView>(await me().get("/me/marketing").expect(200)).spaces[0];
    const subscribe = { space: "lfc", textVersion: SOCIETY, locale: "fr" };

    await me().post("/me/marketing/subscriptions").send(subscribe).expect(204);
    await ctx.drain();
    expect(await state()).toEqual({ space: "lfc", state: "pending", askable: false });
    expect(transport.confirmationsTo("pref@exemple.fr")).toBe(1);

    await me().post("/me/marketing/unsubscriptions").send({ space: "lfc" }).expect(204);
    expect(await state()).toMatchObject({ state: "unsubscribed", askable: false });

    // Une case de commande ne réinscrit pas ; « Mes préférences » si, avec un e-mail.
    await consent.request("lfc", "pref@exemple.fr", {
      textVersion: SOCIETY,
      locale: "fr",
      where: "order",
      ref: "cmd_x",
      verified: true,
    });
    expect(await state()).toMatchObject({ state: "unsubscribed" });

    await me().post("/me/marketing/subscriptions").send(subscribe).expect(204);
    await ctx.drain();
    expect(await state()).toMatchObject({ state: "pending" });
    expect(transport.confirmationsTo("pref@exemple.fr")).toBe(2);
    expect((await registry())[0]).toMatchObject({ unsubscribedSource: "link" });
  });

  it("adresse prouvée : la réinscription vaut tout de suite", async () => {
    await createUser(ctx.prisma, {
      auth0Sub: "auth0|prouve-pref",
      email: "pp@exemple.fr",
      emailVerified: true,
    });
    await consent.unsubscribe("lfc", "pp@exemple.fr", "link");

    await ctx
      .asSub("auth0|prouve-pref")
      .post("/me/marketing/subscriptions")
      .send({ space: "lfc", textVersion: SOCIETY, locale: "en" })
      .expect(204);

    expect(await registry()).toMatchObject([
      { status: "accepted", acceptedWhere: "preferences", unsubscribedAt: null },
    ]);
  });

  it("la case « partenaires » est éteinte : 409, rien de rangé", async () => {
    await createUser(ctx.prisma, { auth0Sub: "auth0|part", email: "part@exemple.fr" });
    await ctx
      .asSub("auth0|part")
      .post("/me/marketing/partners")
      .send({ textVersion: MARKETING_CONSENT_TEXT_VERSIONS.partners, locale: "fr" })
      .expect(409);
    expect(await registry()).toEqual([]);
  });
});

describe("C3 — la purge rend une réinscription jamais confirmée à sa désinscription", () => {
  it("après 7 jours sans clic, l'adresse redevient désinscrite, sans être supprimée", async () => {
    await createUser(ctx.prisma, { auth0Sub: "auth0|oubli", email: "oubli@exemple.fr" });
    await consent.unsubscribe("lfc", "oubli@exemple.fr", "link");
    await ctx
      .asSub("auth0|oubli")
      .post("/me/marketing/subscriptions")
      .send({ space: "lfc", textVersion: SOCIETY, locale: "fr" })
      .expect(204);
    await ctx.drain();
    // La demande, vieillie : seule la date de la demande compte pour la purge.
    await ctx.prisma.mailMarketingPreference.updateMany({
      data: { requestedAt: new Date(daysAgo(8)) },
    });

    await ctx
      .http()
      .post("/admin/mail/requests/purge")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);

    expect(await registry()).toMatchObject([
      { recipientKey: "oubli@exemple.fr", status: "unsubscribed", unsubscribedSource: "link" },
    ]);
  });
});

describe("C5 — la lettre du pied de page", () => {
  const signup = (email: string, extra: Record<string, unknown> = {}) => ({
    email,
    textVersion: MARKETING_CONSENT_TEXT_VERSIONS.newsletter,
    locale: "fr",
    ...extra,
  });

  it("la même réponse pour toute adresse ; seule l'inconnue reçoit une confirmation", async () => {
    await consent.unsubscribe("lfc", "parti@exemple.fr", "link");

    const fresh = await visitor()
      .post("/mail/newsletter")
      .send(signup("neuve@exemple.fr"))
      .expect(202);
    const gone = await visitor()
      .post("/mail/newsletter")
      .send(signup("parti@exemple.fr"))
      .expect(202);
    const again = await visitor()
      .post("/mail/newsletter")
      .send(signup("neuve@exemple.fr"))
      .expect(202);
    await ctx.drain();

    expect(gone.text).toBe(fresh.text);
    expect(again.text).toBe(fresh.text);
    expect(await consent.preferenceOf("lfc", "neuve@exemple.fr")).toBe("pending");
    expect(await consent.preferenceOf("lfc", "parti@exemple.fr")).toBe("unsubscribed");
    expect(transport.confirmationsTo("neuve@exemple.fr")).toBe(1);
    expect(transport.confirmationsTo("parti@exemple.fr")).toBe(0);
  });

  it("le champ piège rempli : la même réponse, rien d'écrit, rien d'envoyé", async () => {
    const trapped = await visitor()
      .post("/mail/newsletter")
      .send(signup("robot@exemple.fr", { website: "https://spam.example" }))
      .expect(202);
    await ctx.drain();

    expect(trapped.text).toBe("");
    expect(await registry()).toEqual([]);
    expect(transport.sent).toEqual([]);
  });

  it("débit par adresse : au-delà, 429 même depuis d'autres IP", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await visitor().post("/mail/newsletter").send(signup("Cible@Exemple.fr")).expect(202);
    }
    await visitor().post("/mail/newsletter").send(signup("cible@exemple.fr ")).expect(429);
  });

  it("débit par IP : au-delà, 429 même pour des adresses différentes", async () => {
    ipSeq += 1;
    const ip = `198.51.100.${String(ipSeq)}`;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await ctx
        .http()
        .set("x-lfc-client-ip", ip)
        .post("/mail/newsletter")
        .send(signup(`ip${String(attempt)}@exemple.fr`))
        .expect(202);
    }
    await ctx
      .http()
      .set("x-lfc-client-ip", ip)
      .post("/mail/newsletter")
      .send(signup("ip-de-trop@exemple.fr"))
      .expect(429);
    await ctx.drain();
  });

  it("une adresse mal formée est refusée à la forme (400), et l'URL ne porte aucune adresse", async () => {
    await visitor().post("/mail/newsletter").send(signup("pas-une-adresse")).expect(400);
  });
});
