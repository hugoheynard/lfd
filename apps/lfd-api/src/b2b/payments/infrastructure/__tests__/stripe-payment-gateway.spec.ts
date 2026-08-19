import { Test } from "@nestjs/testing";

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
