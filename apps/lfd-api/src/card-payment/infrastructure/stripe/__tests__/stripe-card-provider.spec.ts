import Stripe from "stripe";

import {
  CardProviderUnavailableError,
  InvalidProviderSignatureError,
} from "../../../domain/errors/card-payment-errors.js";
import { StripeCardProvider } from "../stripe-card-provider.js";

const WEBHOOK_SECRET = "whsec_test_cartes";
const SECRETS = {
  secretKey: "sk_test_signature_seule",
  publishableKey: "pk_test_cartes",
  webhookSecret: WEBHOOK_SECRET,
};
const signer = new Stripe(SECRETS.secretKey);

/** Un corps signé avec le secret du compte, comme Stripe le ferait. Aucun réseau. */
function signed(type: string, object: Record<string, unknown>, id = "evt_1"): [Buffer, string] {
  const payload = JSON.stringify({ id, object: "event", type, data: { object } });
  const header = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return [Buffer.from(payload), header];
}

function parse(type: string, object: Record<string, unknown>) {
  const [body, header] = signed(type, object);
  return new StripeCardProvider(SECRETS).parseWebhook(body, header);
}

/** 2030-01-10T09:00:00Z, en secondes Unix — comparé à sa seule conversion. */
const CREATED = 1_894_266_000;

describe("StripeCardProvider.parseWebhook — vérifié avec le secret DU COMPTE", () => {
  it("refuse une signature d'un autre secret : rien n'est réduit", () => {
    const payload = JSON.stringify({
      id: "evt_1",
      object: "event",
      type: "x",
      data: { object: {} },
    });
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: "whsec_autre" });

    expect(() =>
      new StripeCardProvider(SECRETS).parseWebhook(Buffer.from(payload), header),
    ).toThrow(InvalidProviderSignatureError);
  });

  it("refuse une signature vide", () => {
    expect(() => new StripeCardProvider(SECRETS).parseWebhook(Buffer.from("{}"), "")).toThrow(
      InvalidProviderSignatureError,
    );
  });

  it("payment_intent.succeeded → paid, avec l'identité de l'événement", () => {
    expect(parse("payment_intent.succeeded", { object: "payment_intent", id: "pi_1" })).toEqual({
      kind: "paid",
      eventId: "evt_1",
      eventType: "payment_intent.succeeded",
      providerRef: "pi_1",
    });
  });

  it("payment_intent.payment_failed → payment_failed", () => {
    expect(
      parse("payment_intent.payment_failed", { object: "payment_intent", id: "pi_1" }),
    ).toMatchObject({ kind: "payment_failed", providerRef: "pi_1" });
  });

  it.each(["refund.created", "refund.updated", "refund.failed"])(
    "%s → refund, réduit comme RecordOrderRefundCommand le lit",
    (type) => {
      expect(
        parse(type, {
          object: "refund",
          id: "re_1",
          amount: 1_000,
          currency: "eur",
          status: "succeeded",
          payment_intent: "pi_1",
          created: CREATED,
        }),
      ).toEqual({
        kind: "refund",
        eventId: "evt_1",
        eventType: type,
        providerRef: "pi_1",
        refundId: "re_1",
        amountCents: 1_000,
        currency: "eur",
        status: "succeeded",
        createdAt: new Date(CREATED * 1000),
      });
    },
  );

  it("un remboursement sans intention, ou d'un statut inconnu, est `other`", () => {
    const base = { object: "refund", id: "re_1", amount: 1, currency: "eur", created: CREATED };
    expect(
      parse("refund.created", { ...base, status: "succeeded", payment_intent: null }),
    ).toMatchObject({ kind: "other" });
    expect(
      parse("refund.created", { ...base, status: "nouveau", payment_intent: "pi_1" }),
    ).toMatchObject({ kind: "other" });
  });

  const LINK = { object: "checkout.session", id: "cs_1", metadata: { paymentLinkId: "pl_1" } };

  it.each([
    ["checkout.session.completed", { ...LINK, payment_status: "paid" }, "paid"],
    ["checkout.session.async_payment_succeeded", LINK, "paid"],
    ["checkout.session.expired", LINK, "expired"],
  ] as const)("%s d'un lien → checkout %s", (type, session, outcome) => {
    expect(parse(type, session)).toMatchObject({ kind: "checkout", outcome, sessionId: "cs_1" });
  });

  it("une page encore impayée, ou qui n'est pas à nous, est `other`", () => {
    expect(
      parse("checkout.session.completed", { ...LINK, payment_status: "unpaid" }),
    ).toMatchObject({ kind: "other" });
    expect(
      parse("checkout.session.expired", { object: "checkout.session", id: "cs_2", metadata: {} }),
    ).toMatchObject({ kind: "other" });
  });

  it("`charge.refunded` est `other` : son objet ne porte plus les remboursements", () => {
    expect(parse("charge.refunded", { object: "charge", id: "ch_1" })).toEqual({
      kind: "other",
      eventId: "evt_1",
      eventType: "charge.refunded",
    });
  });
});

/** Un faux transport : la réponse écrite à la main, la requête retenue. */
function providerAnswering(status: number, body: unknown) {
  const seen: { path: string; body: URLSearchParams }[] = [];
  const fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    seen.push({
      path: url.pathname,
      body: new URLSearchParams(typeof init?.body === "string" ? init.body : ""),
    });
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", "request-id": "req_1" },
      }),
    );
  };
  const client = new Stripe(SECRETS.secretKey, {
    httpClient: Stripe.createFetchHttpClient(fetch),
    maxNetworkRetries: 0,
  });
  return { seen, provider: new StripeCardProvider(SECRETS, client) };
}

describe("StripeCardProvider.createIntent", () => {
  it("la carte seule, le `tag` en métadonnée `companyId` comme avant le bloc", async () => {
    const { seen, provider } = providerAnswering(200, {
      object: "payment_intent",
      id: "pi_9",
      client_secret: "pi_9_secret",
      status: "requires_payment_method",
    });

    await expect(
      provider.createIntent({ amountCents: 2_340, currency: "eur", tag: "personal" }),
    ).resolves.toEqual({ providerRef: "pi_9", clientSecret: "pi_9_secret" });
    expect(seen[0]?.path).toBe("/v1/payment_intents");
    expect(seen[0]?.body.get("amount")).toBe("2340");
    expect(seen[0]?.body.get("payment_method_types[0]")).toBe("card");
    expect(seen[0]?.body.has("payment_method_types[1]")).toBe(false);
    expect(seen[0]?.body.get("metadata[companyId]")).toBe("personal");
  });

  it("refuse une intention sans secret client", async () => {
    const { provider } = providerAnswering(200, {
      object: "payment_intent",
      id: "pi_9",
      client_secret: null,
      status: "requires_payment_method",
    });

    await expect(
      provider.createIntent({ amountCents: 100, currency: "eur", tag: "cmp_1" }),
    ).rejects.toBeInstanceOf(CardProviderUnavailableError);
  });
});

describe("StripeCardProvider.cancelIntent", () => {
  it("ne lève jamais : une panne est `unavailable`", async () => {
    const { provider } = providerAnswering(500, { error: { type: "api_error", message: "x" } });

    await expect(provider.cancelIntent("pi_1")).resolves.toMatchObject({ kind: "unavailable" });
  });

  it("rend la clé publique du compte", () => {
    expect(new StripeCardProvider(SECRETS).publishableKey()).toBe("pk_test_cartes");
  });
});
