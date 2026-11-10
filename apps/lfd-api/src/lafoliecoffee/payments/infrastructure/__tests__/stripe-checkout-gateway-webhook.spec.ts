import Stripe from "stripe";

import type { AppConfig } from "../../../../platform/config/app-config.js";
import {
  InvalidWebhookSignatureError,
  PaymentLinksWebhookNotConfiguredError,
} from "../../domain/errors/payment-errors.js";
import { StripeCheckoutGateway } from "../stripe-checkout-gateway.js";

const LINKS_SECRET = "whsec_test_liens";
const signer = new Stripe("sk_test_signature_seule");

/** Une configuration doublée : les deux seules méthodes que l'adaptateur lit. */
function gatewayWith(linksSecret: string | null): StripeCheckoutGateway {
  const config: Pick<AppConfig, "stripeConfig" | "stripeLinksWebhookSecret"> = {
    stripeConfig: () => null,
    stripeLinksWebhookSecret: () => linksSecret,
  };
  return new StripeCheckoutGateway(config);
}

function signed(type: string, session: Record<string, unknown>, secret = LINKS_SECRET) {
  const payload = JSON.stringify({
    id: "evt_1",
    object: "event",
    type,
    data: { object: { object: "checkout.session", ...session } },
  });
  return {
    body: Buffer.from(payload),
    header: signer.webhooks.generateTestHeaderString({ payload, secret }),
  };
}

function parse(type: string, session: Record<string, unknown>) {
  const { body, header } = signed(type, session);
  return gatewayWith(LINKS_SECRET).parseLinkWebhook(body, header);
}

const OURS = { id: "cs_1", metadata: { paymentLinkId: "pl_1" } };

/**
 * Le webhook des liens (plan M2, §4.5), par la VRAIE vérification de
 * signature — le corps signé avec le secret de l'endpoint des liens, comme
 * Stripe le ferait. Aucun réseau. Les cas viennent de la spec de l'ancien
 * webhook commun (`stripe-payment-gateway.spec.ts`, retiré au lot P0.c2).
 */
describe("StripeCheckoutGateway — le webhook des liens", () => {
  it("completed + paid → lien payé", () => {
    expect(parse("checkout.session.completed", { ...OURS, payment_status: "paid" })).toEqual({
      kind: "paid",
      sessionId: "cs_1",
    });
  });

  it("completed encore impayé (moyen différé) → ignoré : l'issue viendra plus tard", () => {
    expect(parse("checkout.session.completed", { ...OURS, payment_status: "unpaid" })).toEqual({
      kind: "ignored",
    });
  });

  it("async_payment_succeeded → lien payé", () => {
    expect(parse("checkout.session.async_payment_succeeded", OURS)).toEqual({
      kind: "paid",
      sessionId: "cs_1",
    });
  });

  it("expired → lien expiré", () => {
    expect(parse("checkout.session.expired", OURS)).toEqual({
      kind: "expired",
      sessionId: "cs_1",
    });
  });

  it("une session sans `paymentLinkId` n'est pas à nous → ignorée", () => {
    expect(
      parse("checkout.session.completed", { id: "cs_2", metadata: {}, payment_status: "paid" }),
    ).toEqual({ kind: "ignored" });
  });

  it("un événement d'intention n'est pas un lien → ignoré", () => {
    expect(parse("payment_intent.succeeded", { id: "pi_1" })).toEqual({ kind: "ignored" });
  });

  it("refuse une signature faite avec un autre secret (celui des cartes) : rien n'est traité", () => {
    const { body, header } = signed("checkout.session.expired", OURS, "whsec_des_cartes");
    expect(() => gatewayWith(LINKS_SECRET).parseLinkWebhook(body, header)).toThrow(
      InvalidWebhookSignatureError,
    );
  });

  it("sans secret des liens, refuse en 400 (jamais un 500) — Stripe réessaiera", () => {
    const { body, header } = signed("checkout.session.expired", OURS);
    expect(() => gatewayWith(null).parseLinkWebhook(body, header)).toThrow(
      PaymentLinksWebhookNotConfiguredError,
    );
  });
});
