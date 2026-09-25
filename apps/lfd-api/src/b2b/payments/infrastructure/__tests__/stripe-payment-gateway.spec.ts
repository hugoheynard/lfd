import { Test } from "@nestjs/testing";
import Stripe from "stripe";

import { AppConfig, type StripeConfig } from "../../../../platform/config/app-config.js";
import { PaymentGatewayUnavailableError } from "../../domain/errors/payment-errors.js";
import { StripePaymentGateway } from "../stripe-payment-gateway.js";

/**
 * Construit la passerelle avec un `AppConfig` doublé qui ne rend QUE `stripeConfig`
 * (seule méthode consommée par l'adaptateur). `null` = canal non configuré.
 */
async function gatewayWith(stripe: StripeConfig | null): Promise<StripePaymentGateway> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StripePaymentGateway,
      { provide: AppConfig, useValue: { stripeConfig: () => stripe } },
    ],
  }).compile();
  return moduleRef.get(StripePaymentGateway);
}

describe("StripePaymentGateway (canal non configuré)", () => {
  it("refuse createIntent par une erreur technique quand Stripe n'est pas configuré", async () => {
    const gateway = await gatewayWith(null);
    await expect(
      gateway.createIntent({ amountCents: 1000, currency: "eur", companyId: "c1" }),
    ).rejects.toBeInstanceOf(PaymentGatewayUnavailableError);
  });

  it("refuse publishableKey quand Stripe n'est pas configuré", async () => {
    const gateway = await gatewayWith(null);
    expect(() => gateway.publishableKey()).toThrow(PaymentGatewayUnavailableError);
  });

  it("refuse parseWebhook quand Stripe n'est pas configuré", async () => {
    const gateway = await gatewayWith(null);
    expect(() => gateway.parseWebhook(Buffer.from("{}"), "sig")).toThrow(
      PaymentGatewayUnavailableError,
    );
  });
});

/**
 * Les trois événements d'une page hébergée (plan liens de paiement §2b), passés
 * par la VRAIE vérification de signature : le corps est signé avec le secret de
 * test, exactement comme Stripe le ferait. Aucun réseau.
 */
describe("StripePaymentGateway — les événements d'un lien libre", () => {
  const WEBHOOK_SECRET = "whsec_test_liens";
  const signer = new Stripe("sk_test_signature_seule");

  function signed(type: string, session: Record<string, unknown>): [Buffer, string] {
    const payload = JSON.stringify({
      id: "evt_1",
      object: "event",
      type,
      data: { object: { object: "checkout.session", ...session } },
    });
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    return [Buffer.from(payload), header];
  }

  async function parse(type: string, session: Record<string, unknown>) {
    const gateway = await gatewayWith({
      secretKey: "sk_test_signature_seule",
      webhookSecret: WEBHOOK_SECRET,
      publishableKey: "pk_test",
    });
    const [body, header] = signed(type, session);
    return gateway.parseWebhook(body, header);
  }

  const OURS = { id: "cs_1", metadata: { paymentLinkId: "pl_1" } };

  it("completed + paid → lien payé", async () => {
    await expect(
      parse("checkout.session.completed", { ...OURS, payment_status: "paid" }),
    ).resolves.toEqual({ kind: "link_paid", sessionId: "cs_1" });
  });

  it("completed encore impayé (moyen différé) → ignoré : l'issue viendra plus tard", async () => {
    await expect(
      parse("checkout.session.completed", { ...OURS, payment_status: "unpaid" }),
    ).resolves.toEqual({ kind: "ignored" });
  });

  it("async_payment_succeeded → lien payé", async () => {
    await expect(parse("checkout.session.async_payment_succeeded", OURS)).resolves.toEqual({
      kind: "link_paid",
      sessionId: "cs_1",
    });
  });

  it("expired → lien expiré", async () => {
    await expect(parse("checkout.session.expired", OURS)).resolves.toEqual({
      kind: "link_expired",
      sessionId: "cs_1",
    });
  });

  it("une session sans `paymentLinkId` n'est pas à nous → ignorée", async () => {
    await expect(
      parse("checkout.session.completed", { id: "cs_2", metadata: {}, payment_status: "paid" }),
    ).resolves.toEqual({ kind: "ignored" });
  });
});
