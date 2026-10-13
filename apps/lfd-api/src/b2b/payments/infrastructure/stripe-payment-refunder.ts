import { Injectable } from "@nestjs/common";
import Stripe from "stripe";

import { AppConfig } from "../../../platform/config/app-config.js";
import {
  PaymentRefunder,
  type RefundIssuance,
  type RefundLookup,
  type RefundRequestParams,
} from "../domain/payment-refunder.js";
import { StripeRefundCalls } from "./stripe-refund-calls.js";

const NOT_CONFIGURED = "STRIPE_SECRET_KEY non configurée";

/**
 * Adaptateur **Stripe** de {@link PaymentRefunder} (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C4.7). Canal
 * optionnel, comme la passerelle d'encaissement : sans configuration, chaque
 * appel rend `unavailable` — il ne lève jamais.
 */
@Injectable()
export class StripePaymentRefunder extends PaymentRefunder {
  private readonly calls: StripeRefundCalls | null;

  constructor(appConfig: AppConfig) {
    super();
    const config = appConfig.stripeConfig();
    this.calls = config === null ? null : new StripeRefundCalls(new Stripe(config.secretKey));
  }

  refundRemainder(params: RefundRequestParams): Promise<RefundIssuance> {
    if (this.calls === null) {
      return Promise.resolve({ kind: "unavailable", reason: NOT_CONFIGURED });
    }
    return this.calls.refundRemainder(params);
  }

  findRefund(params: RefundRequestParams): Promise<RefundLookup> {
    if (this.calls === null) {
      return Promise.resolve({ kind: "unavailable", reason: NOT_CONFIGURED });
    }
    return this.calls.findRefund(params);
  }
}
