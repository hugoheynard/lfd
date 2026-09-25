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
import { Public } from "../../../platform/auth/public.decorator.js";
import { InvalidWebhookSignatureError } from "../domain/errors/payment-errors.js";
import { PaymentGateway, type PaymentWebhookEvent } from "../domain/payment-gateway.js";
import { ExpirePaymentLinkCommand } from "../application/commands/expire-payment-link.command.js";
import { SettlePaymentLinkCommand } from "../application/commands/settle-payment-link.command.js";

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

    const command = commandFor(this.payments.parseWebhook(rawBody, signature));
    if (command !== null) {
      await this.commands.execute(command);
    }
    // `ignored` (ou traité) : 200 pour que Stripe cesse de réessayer.
    return { received: true };
  }
}

/**
 * L'événement réduit → la commande qui le projette. Une table exhaustive sur
 * `kind` : un type d'événement ajouté au port sans sa commande ne compile pas.
 */
const COMMANDS: {
  readonly [K in PaymentWebhookEvent["kind"]]: (
    event: Extract<PaymentWebhookEvent, { kind: K }>,
  ) => object | null;
} = {
  succeeded: (event) => new ConfirmOrderPaymentCommand(event.paymentIntentId, "succeeded"),
  failed: (event) => new ConfirmOrderPaymentCommand(event.paymentIntentId, "failed"),
  link_paid: (event) => new SettlePaymentLinkCommand(event.sessionId),
  link_expired: (event) => new ExpirePaymentLinkCommand(event.sessionId),
  ignored: () => null,
};

function commandFor<E extends PaymentWebhookEvent>(event: E): object | null {
  const project = COMMANDS[event.kind] as (event: E) => object | null;
  return project(event);
}
