import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  type RawBodyRequest,
} from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import type { Request } from "express";

import { ConfirmOrderPaymentCommand } from "../../orders/application/commands/confirm-order-payment.command.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { InvalidWebhookSignatureError } from "../domain/errors/payment-errors.js";
import { PaymentGateway } from "../domain/payment-gateway.js";

/**
 * Réception des **webhooks Stripe**.
 *
 * Route **publique** (Stripe n'a pas de jeton Auth0) mais **authentifiée par
 * signature** : `parseWebhook` vérifie la signature `stripe-signature` contre le
 * secret de webhook ; un corps non signé lève une 400 et n'est jamais traité.
 * C'est le seul point du système où l'on fait confiance à un appel externe, et
 * uniquement parce que la signature le prouve.
 *
 * Le corps doit être le **payload brut** (`rawBody`) : Stripe signe les octets
 * exacts, un JSON re-sérialisé casserait la signature. `main.ts` active
 * `rawBody: true` pour cela.
 */
@Controller("payments")
export class PaymentsWebhookController {
  constructor(
    private readonly payments: PaymentGateway,
    private readonly commands: CommandBus,
  ) {}

  @Public()
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature: string | undefined,
  ): Promise<{ received: true }> {
    const rawBody = request.rawBody;
    if (rawBody === undefined || signature === undefined) {
      // Pas de corps brut ou pas de signature : on ne peut pas prouver l'origine.
      throw new InvalidWebhookSignatureError();
    }

    const event = this.payments.parseWebhook(rawBody, signature);
    if (event.kind === "succeeded") {
      await this.commands.execute(
        new ConfirmOrderPaymentCommand(event.paymentIntentId, "succeeded"),
      );
    } else if (event.kind === "failed") {
      await this.commands.execute(new ConfirmOrderPaymentCommand(event.paymentIntentId, "failed"));
    }
    // `ignored` (ou traité) : 200 pour que Stripe cesse de réessayer.
    return { received: true };
  }
}
