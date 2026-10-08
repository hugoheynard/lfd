import { Test } from "@nestjs/testing";
import Stripe from "stripe";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { StripePaymentGateway } from "../stripe-payment-gateway.js";

/**
 * Les remboursements (lot R1 du plan `plan-facture-carte-et-remboursements.md`),
 * passés par la VRAIE vérification de signature : le corps est signé avec le
 * secret de test, exactement comme Stripe le ferait. Aucun réseau.
 */
const WEBHOOK_SECRET = "whsec_test_remboursements";
const signer = new Stripe("sk_test_signature_seule");

/** 2030-01-10T09:00:00Z, en secondes Unix — Stripe date ainsi ses objets. */
const CREATED_SECONDS = 1_894_266_000;

async function parse(type: string, object: Record<string, unknown>) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StripePaymentGateway,
      {
        provide: AppConfig,
        useValue: {
          stripeConfig: () => ({
            secretKey: "sk_test_signature_seule",
            webhookSecret: WEBHOOK_SECRET,
            publishableKey: "pk_test",
          }),
        },
      },
    ],
  }).compile();
  const payload = JSON.stringify({ id: "evt_1", object: "event", type, data: { object } });
  const header = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return moduleRef.get(StripePaymentGateway).parseWebhook(Buffer.from(payload), header);
}

const REFUND = {
  object: "refund",
  id: "re_1",
  amount: 1_250,
  currency: "eur",
  status: "succeeded",
  payment_intent: "pi_1",
  created: CREATED_SECONDS,
};

describe("StripePaymentGateway — les remboursements", () => {
  it.each(["refund.created", "refund.updated", "refund.failed"])(
    "%s → un remboursement réduit, à l'instant Stripe",
    async (type) => {
      await expect(parse(type, REFUND)).resolves.toEqual({
        kind: "refund",
        refundId: "re_1",
        paymentIntentId: "pi_1",
        amountCents: 1_250,
        currency: "eur",
        status: "succeeded",
        createdAt: new Date(CREATED_SECONDS * 1000),
      });
    },
  );

  it("garde la devise telle que Stripe l'écrit : la refuser est l'affaire du domaine", async () => {
    await expect(parse("refund.created", { ...REFUND, currency: "usd" })).resolves.toMatchObject({
      kind: "refund",
      currency: "usd",
    });
  });

  it("charge.refunded est ignoré : il ne porte plus la liste depuis l'API 2022-11-15", async () => {
    await expect(
      parse("charge.refunded", { object: "charge", id: "ch_1", payment_intent: "pi_1" }),
    ).resolves.toEqual({ kind: "ignored" });
  });

  it("un remboursement sans intention de paiement est ignoré", async () => {
    await expect(parse("refund.created", { ...REFUND, payment_intent: null })).resolves.toEqual({
      kind: "ignored",
    });
  });

  it("un statut que le port ne connaît pas est ignoré plutôt que travesti", async () => {
    await expect(parse("refund.updated", { ...REFUND, status: "inconnu" })).resolves.toEqual({
      kind: "ignored",
    });
  });
});
