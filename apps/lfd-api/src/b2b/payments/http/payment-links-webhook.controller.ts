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

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecordPaymentLinkEventCommand } from "../application/commands/record-payment-link-event.command.js";

/**
 * **Le webhook des liens de paiement** — `POST /payments/links/webhook`, son
 * endpoint Stripe et son secret (`STRIPE_LINKS_WEBHOOK_SECRET`) à lui (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §4.5). Les cartes ont quitté `b2b/payments` pour le bloc `card-payment` ;
 * les liens restent ici, avec leur client Stripe, jusqu'au jour où un lien
 * deviendra un sujet.
 *
 * Route **publique** (Stripe n'a pas de jeton Auth0) mais **authentifiée par
 * signature**, sur le corps BRUT (`main.ts` active `rawBody`). Le contrôleur
 * ne fait que traduire : il n'injecte que le bus (`lint:controller-buses`).
 * Secret absent ou signature invalide : 400, rien n'est traité, et Stripe
 * réessaie ; tout le reste rend 200.
 */
@Controller("payments/links")
export class PaymentLinksWebhookController {
  constructor(private readonly commands: CommandBus) {}

  @Public()
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature: string | undefined,
  ): Promise<{ received: true }> {
    // Sans corps brut ni signature, la vérification échoue au handler.
    await this.commands.execute<RecordPaymentLinkEventCommand, void>(
      new RecordPaymentLinkEventCommand(request.rawBody ?? Buffer.alloc(0), signature ?? ""),
    );
    return { received: true };
  }
}
