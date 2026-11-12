import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  type RawBodyRequest,
} from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import type { Request } from "express";

import { Public } from "../../platform/auth/public.decorator.js";
import { UNNAMED_WEBHOOK_ACCOUNT } from "../../platform/config/card-accounts.js";
import { RecordProviderEventCommand } from "../application/commands/record-provider-event.command.js";
import { Idempotent } from "../../platform/shared/http/idempotent.decorator.js";

/**
 * **Les webhooks des comptes d'encaissement par carte** (plan M2, §3.2,
 * §3.3) — un par compte : `POST /payments/webhook/:account`, vérifié avec le
 * secret DE CE COMPTE. `POST /payments/webhook`, sans compte, vaut
 * `lfc-stripe` jusqu'au resserrement P2 : c'est l'adresse que l'endpoint
 * Stripe connaît aujourd'hui.
 *
 * Route **publique** (le prestataire n'a pas de jeton Auth0) mais
 * **authentifiée par signature**, sur le corps BRUT (`main.ts` active
 * `rawBody`). Ce contrôleur ne fait que traduire : le webhook est une
 * commande (`RecordProviderEventCommand`), et il n'injecte que le bus
 * (`lint:controller-buses`). Un compte inconnu ou une signature invalide sont
 * des refus du handler (400) ; tout le reste rend 200, pour que le
 * prestataire cesse de réessayer.
 */
@Controller("payments")
export class CardPaymentsWebhookController {
  constructor(private readonly commands: CommandBus) {}

  @Public()
  @Post("webhook/:account")
  @HttpCode(HttpStatus.OK)
  @Idempotent(
    "webhook, par la clé de l'émetteur : un événement rejoué par le prestataire est reconnu périmé (déjà encaissé, refus rejoué) ou déjà constaté, et ne change ni le paiement ni le carnet ; il ne laisse qu'une trace de l'événement ignoré",
  )
  async handleForAccount(
    @Param("account") account: string,
    @Req() request: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature: string | undefined,
  ): Promise<{ received: true }> {
    await this.record(account, request, signature);
    return { received: true };
  }

  @Public()
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  @Idempotent(
    "webhook, par la clé de l'émetteur : un événement rejoué par le prestataire est reconnu périmé (déjà encaissé, refus rejoué) ou déjà constaté, et ne change ni le paiement ni le carnet ; il ne laisse qu'une trace de l'événement ignoré",
  )
  async handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature: string | undefined,
  ): Promise<{ received: true }> {
    await this.record(UNNAMED_WEBHOOK_ACCOUNT, request, signature);
    return { received: true };
  }

  /** Sans corps brut ni signature, la vérification échoue au handler : rien n'est traité. */
  private record(
    account: string,
    request: RawBodyRequest<Request>,
    signature: string | undefined,
  ): Promise<void> {
    return this.commands.execute<RecordProviderEventCommand, void>(
      new RecordProviderEventCommand(account, request.rawBody ?? Buffer.alloc(0), signature ?? ""),
    );
  }
}
