import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import type { Request } from "express";

import { Public } from "../../auth/public.decorator.js";
import {
  ReceiveResendEventCommand,
  type ResendEventReceipt,
} from "./receive-resend-event.command.js";

/**
 * Réception des **webhooks Resend** — ce que devient un e-mail après son envoi.
 *
 * Route **publique** (Resend n'a pas de jeton Auth0) mais **authentifiée par
 * signature** : sans preuve d'origine, n'importe qui pourrait déclarer que les
 * e-mails d'un concurrent rebondissent. Le corps doit être le **payload brut** —
 * Svix signe les octets exacts, un JSON re-sérialisé casserait la signature.
 *
 * Le code de retour dit à Resend quoi faire, et c'est une décision, pas un
 * détail : un `2xx` arrête les reprises, un `5xx` les relance. On ne rend donc
 * `5xx` **jamais** — même un événement illisible est acquitté, parce qu'aucune
 * reprise ne le rendra lisible. La preuve et le traitement vivent dans
 * `ReceiveResendEventHandler` ; ce contrôleur ne traduit que le verdict.
 */
@Controller("webhooks/resend")
export class ResendWebhookController {
  constructor(private readonly commands: CommandBus) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers("svix-id") id: string | undefined,
    @Headers("svix-timestamp") timestamp: string | undefined,
    @Headers("svix-signature") signature: string | undefined,
  ): Promise<{ received: true }> {
    const body = request.rawBody?.toString("utf8") ?? "";
    const receipt = await this.commands.execute<ReceiveResendEventCommand, ResendEventReceipt>(
      new ReceiveResendEventCommand({ id, timestamp, signature }, body),
    );
    if (receipt === "refused") {
      throw new UnauthorizedException();
    }
    return { received: true };
  }
}
