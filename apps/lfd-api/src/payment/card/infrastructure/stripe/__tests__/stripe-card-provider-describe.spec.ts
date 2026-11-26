import Stripe from "stripe";

import { StripeCardProvider } from "../stripe-card-provider.js";

const WEBHOOK_SECRET = "whsec_test_cartes";
const SECRETS = {
  secretKey: "sk_test_signature_seule",
  publishableKey: "pk_test_cartes",
  webhookSecret: WEBHOOK_SECRET,
};

/** Un faux transport : la réponse écrite à la main, la requête retenue. */
function providerAnswering(status: number, body: unknown) {
  const seen: { path: string; method: string; body: URLSearchParams }[] = [];
  const fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    seen.push({
      path: url.pathname,
      method: init?.method ?? "GET",
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

const LABEL = {
  description: "LFD · La Folie Coffee pro · Commande n° 2026-01234 · paiement",
  metadata: { order_number: "2026-01234", subject_id: "ord_1" },
};

describe("StripeCardProvider.describeIntent — le libellé définitif (lot 2)", () => {
  it("pose la description et les clés, rien d'autre", async () => {
    const { seen, provider } = providerAnswering(200, { object: "payment_intent", id: "pi_1" });

    await expect(provider.describeIntent("pi_1", LABEL)).resolves.toEqual({ kind: "described" });

    expect(seen[0]?.path).toBe("/v1/payment_intents/pi_1");
    expect(seen[0]?.method).toBe("POST");
    const body = seen[0]?.body;
    expect(body?.get("description")).toBe(LABEL.description);
    expect(body?.get("metadata[order_number]")).toBe("2026-01234");
    expect(body?.get("metadata[subject_id]")).toBe("ord_1");
    expect(body?.has("customer")).toBe(false);
    expect(body?.has("amount")).toBe(false);
    expect(body?.has("metadata[companyId]")).toBe(false);
  });

  it("une requête refusée (intention inconnue) est `refused` : la reprendre ne changerait rien", async () => {
    const { provider } = providerAnswering(404, {
      error: { type: "invalid_request_error", message: "No such payment_intent" },
    });

    await expect(provider.describeIntent("pi_x", LABEL)).resolves.toMatchObject({
      kind: "refused",
    });
  });

  it("une panne est `unavailable`, jamais une exception", async () => {
    const { provider } = providerAnswering(500, { error: { type: "api_error", message: "x" } });

    await expect(provider.describeIntent("pi_1", LABEL)).resolves.toMatchObject({
      kind: "unavailable",
    });
  });
});

describe("StripeCardProvider.parseWebhook — l'écho du libellé", () => {
  it("`payment_intent.updated` est `other` : il ne touche à aucun paiement", () => {
    const signer = new Stripe(SECRETS.secretKey);
    const payload = JSON.stringify({
      id: "evt_9",
      object: "event",
      type: "payment_intent.updated",
      data: { object: { object: "payment_intent", id: "pi_1", status: "succeeded" } },
    });
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });

    expect(new StripeCardProvider(SECRETS).parseWebhook(Buffer.from(payload), header)).toEqual({
      kind: "other",
      eventId: "evt_9",
      eventType: "payment_intent.updated",
    });
  });
});
